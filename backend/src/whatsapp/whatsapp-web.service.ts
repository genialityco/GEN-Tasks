import {
  BadRequestException,
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnModuleDestroy,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type {
  AuthenticationCreds,
  AuthenticationState,
  ConnectionState,
  SocketConfig,
  WASocket,
} from 'baileys';
import * as QRCode from 'qrcode';
import {
  FirestoreCollections,
  WhatsappWebConnectionStatus,
  WhatsappWebGroup,
  WhatsappWebSessionStatus,
} from '@gen-task/shared';
import { FirebaseService } from '../firebase/firebase.service';
import { normalizePhoneForWhatsApp } from '../common/phone';
import { useFirestoreAuthState } from './whatsapp-web-auth-state';

type Baileys = typeof import('baileys');
/** Baileys no re-exporta su interfaz `ILogger`. */
type ILogger = SocketConfig['logger'];

/**
 * Baileys 7 es ESM puro y el backend compila a CommonJS: TypeScript
 * reescribiria un `import()` normal a `require()`, que falla con ESM. Se
 * construye la llamada fuera del alcance del compilador.
 */
const importEsm = new Function('specifier', 'return import(specifier)') as (
  specifier: string,
) => Promise<Baileys>;
let baileysModule: Promise<Baileys> | null = null;
function loadBaileys(): Promise<Baileys> {
  return (baileysModule ??= importEsm('baileys'));
}

/** Tope de espera entre reintentos de reconexion de una sesion ya vinculada. */
const MAX_RECONNECT_DELAY_MS = 60_000;

/** Estado en memoria de la conexion de una organizacion. */
interface SessionRuntime {
  status: WhatsappWebConnectionStatus;
  sock?: WASocket;
  qrDataUrl?: string;
  phone?: string;
  name?: string;
  lastError?: string;
  /** Telefono para el que se pidio vincular por codigo (en vez de QR). */
  pairingPhone?: string;
  /** Codigo de 8 caracteres a ingresar en el telefono. */
  pairingCode?: string;
  /** Evita pedir dos codigos en la misma conexion (Baileys repite el evento qr). */
  pairingRequested?: boolean;
  /**
   * Credenciales en memoria. Se reutilizan entre reconexiones: justo despues
   * de vincular WhatsApp pide reiniciar la conexion y releer Firestore en ese
   * momento podria traer credenciales aun no guardadas.
   */
  auth?: { state: AuthenticationState; saveCreds: () => Promise<void> };
  retries: number;
  /** true mientras se cierra a proposito (desvincular / apagado): no reconectar. */
  stopping: boolean;
  reconnectTimer?: NodeJS.Timeout;
}

/**
 * Indica si las credenciales completaron la vinculacion. Por QR basta con
 * `me`; por codigo, Baileys llena `me` al pedir el codigo y solo marca
 * `registered` cuando se confirma en el telefono.
 */
function isPaired(creds: AuthenticationCreds): boolean {
  return Boolean(creds.me) && (!creds.pairingCode || creds.registered);
}

/** Extrae el telefono (solo digitos) de un JID `57300...:12@s.whatsapp.net`. */
function jidToPhone(jid?: string): string | undefined {
  return jid?.split(/[:@]/)[0] || undefined;
}

/**
 * Logger compatible con Baileys. Baileys registra como "error" muchos eventos
 * benignos (descifrado de mensajes ajenos, reintentos), por lo que solo se
 * reflejan en debug; los cierres de conexion relevantes los registra el
 * servicio.
 */
function makeBaileysLogger(logger: Logger): ILogger {
  const noop = () => undefined;
  const adapter: ILogger = {
    level: 'error',
    child: () => adapter,
    trace: noop,
    debug: noop,
    info: noop,
    warn: noop,
    error: (obj, msg) =>
      logger.debug(`[baileys] ${msg ?? ''} ${obj instanceof Error ? obj.message : ''}`),
  };
  return adapter;
}

/**
 * Envio de WhatsApp por la libreria NO oficial Baileys (protocolo de WhatsApp
 * Web). Cada organizacion vincula su propio numero escaneando un QR; la sesion
 * se guarda en Firestore (`whatsapp_web_sessions/{orgId}/auth`) y se reconecta
 * al arrancar el backend.
 *
 * A diferencia del Cloud API permite escribir a cualquier grupo del que la
 * cuenta vinculada sea miembro, con un solo mensaje para todo el grupo.
 *
 * Solo debe correr en UNA instancia del backend por sesion: si dos instancias
 * abren la misma, WhatsApp cierra una (connectionReplaced). Con
 * `WHATSAPP_WEB_ENABLED=false` se desactiva en una instancia.
 */
@Injectable()
export class WhatsappWebService implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(WhatsappWebService.name);
  private readonly baileysLogger = makeBaileysLogger(this.logger);
  private readonly sessions = new Map<string, SessionRuntime>();

  constructor(
    private readonly firebase: FirebaseService,
    private readonly config: ConfigService,
  ) {}

  private get enabled(): boolean {
    return this.config.get<string>('WHATSAPP_WEB_ENABLED') !== 'false';
  }

  private get collection() {
    return this.firebase.firestore.collection(
      FirestoreCollections.WHATSAPP_WEB_SESSIONS,
    );
  }

  private authCollection(organizationId: string) {
    return this.collection.doc(organizationId).collection('auth');
  }

  // ----------------------------------------------------------------------
  // Ciclo de vida
  // ----------------------------------------------------------------------

  /** Reconecta las sesiones que quedaron vinculadas antes del reinicio. */
  async onApplicationBootstrap(): Promise<void> {
    if (!this.enabled) return;
    const snap = await this.collection.where('linked', '==', true).get();
    for (const doc of snap.docs) {
      void this.start(doc.id).catch((err) =>
        this.logger.error(
          `No se pudo reconectar WhatsApp Web de ${doc.id}: ${(err as Error).message}`,
        ),
      );
    }
  }

  async onModuleDestroy(): Promise<void> {
    for (const rt of this.sessions.values()) {
      rt.stopping = true;
      clearTimeout(rt.reconnectTimer);
      rt.sock?.end(undefined);
    }
  }

  // ----------------------------------------------------------------------
  // Panel: vinculacion
  // ----------------------------------------------------------------------

  getStatus(organizationId: string): WhatsappWebSessionStatus {
    const rt = this.sessions.get(organizationId);
    return {
      organizationId,
      status: rt?.status ?? 'DISCONNECTED',
      ...(rt?.qrDataUrl ? { qrDataUrl: rt.qrDataUrl } : {}),
      ...(rt?.pairingCode ? { pairingCode: rt.pairingCode } : {}),
      ...(rt?.phone ? { phone: rt.phone } : {}),
      ...(rt?.name ? { name: rt.name } : {}),
      ...(rt?.lastError ? { lastError: rt.lastError } : {}),
    };
  }

  /**
   * Inicia la conexion. Si no hay sesion guardada, en unos segundos el estado
   * pasa a QR (el panel consulta el estado): con el codigo QR a escanear o,
   * si se indica `phone`, con un codigo de 8 caracteres para vincular desde
   * WhatsApp > Dispositivos vinculados > Vincular con el numero de telefono.
   */
  async connect(
    organizationId: string,
    phone?: string,
  ): Promise<WhatsappWebSessionStatus> {
    this.assertEnabled();
    let pairingPhone: string | undefined;
    if (phone !== undefined) {
      pairingPhone = normalizePhoneForWhatsApp(phone) ?? undefined;
      if (!pairingPhone) throw new BadRequestException('Telefono invalido.');
    }
    const rt = this.sessions.get(organizationId);
    if (!rt || rt.status === 'DISCONNECTED') {
      await this.start(organizationId, pairingPhone);
    } else if (rt.status === 'QR' && rt.pairingPhone !== pairingPhone) {
      // Se cambio de metodo (QR <-> codigo) o de numero mientras se esperaba.
      this.closeSocket(rt);
      await this.start(organizationId, pairingPhone);
    }
    return this.getStatus(organizationId);
  }

  /** Cierra la sesion en WhatsApp (desvincula el dispositivo) y borra las credenciales. */
  async disconnect(organizationId: string): Promise<WhatsappWebSessionStatus> {
    const rt = this.sessions.get(organizationId);
    if (rt) {
      rt.stopping = true;
      clearTimeout(rt.reconnectTimer);
      const sock = rt.sock;
      rt.sock = undefined;
      if (sock) {
        await sock.logout().catch(() => sock.end(undefined));
      }
    }
    this.sessions.delete(organizationId);
    await this.clearAuth(organizationId);
    return this.getStatus(organizationId);
  }

  // ----------------------------------------------------------------------
  // Grupos y envio
  // ----------------------------------------------------------------------

  /** Grupos de los que la cuenta vinculada es miembro. */
  async listGroups(organizationId: string): Promise<WhatsappWebGroup[]> {
    const sock = this.requireSocket(organizationId);
    const groups = await sock.groupFetchAllParticipating();
    return Object.values(groups)
      .map((g) => ({
        id: g.id,
        subject: g.subject,
        size: g.size ?? g.participants?.length ?? 0,
      }))
      .sort((a, b) => a.subject.localeCompare(b.subject));
  }

  /** Envia un texto a un telefono. Devuelve el id del mensaje. */
  async sendToPhone(
    organizationId: string,
    phone: string,
    body: string,
  ): Promise<string | null> {
    const digits = normalizePhoneForWhatsApp(phone);
    if (!digits) throw new BadRequestException('Telefono invalido.');
    return this.sendText(organizationId, `${digits}@s.whatsapp.net`, body);
  }

  /** Envia un texto a un grupo (JID `...@g.us`). Devuelve el id del mensaje. */
  async sendToGroup(
    organizationId: string,
    groupJid: string,
    body: string,
  ): Promise<string | null> {
    if (!groupJid.endsWith('@g.us')) {
      throw new BadRequestException('Id de grupo de WhatsApp invalido.');
    }
    return this.sendText(organizationId, groupJid, body);
  }

  private async sendText(
    organizationId: string,
    jid: string,
    body: string,
  ): Promise<string | null> {
    const sock = this.requireSocket(organizationId);
    const sent = await sock.sendMessage(jid, { text: body });
    return sent?.key?.id ?? null;
  }

  // ----------------------------------------------------------------------
  // Conexion
  // ----------------------------------------------------------------------

  private async start(organizationId: string, pairingPhone?: string): Promise<void> {
    let rt = this.sessions.get(organizationId);
    if (!rt) {
      rt = { status: 'CONNECTING', retries: 0, stopping: false };
      this.sessions.set(organizationId, rt);
    }
    clearTimeout(rt.reconnectTimer);
    rt.stopping = false;
    rt.status = 'CONNECTING';
    rt.qrDataUrl = undefined;
    rt.pairingPhone = pairingPhone;
    rt.pairingCode = undefined;
    rt.pairingRequested = false;

    try {
      const baileys = await loadBaileys();
      rt.auth ??= await useFirestoreAuthState(
        baileys,
        this.authCollection(organizationId),
      );
      // Una vinculacion por codigo que no se completo deja `me` sin
      // registrar; con esas credenciales WhatsApp intenta un login y falla.
      if (rt.auth.state.creds.me && !isPaired(rt.auth.state.creds)) {
        await this.firebase.firestore.recursiveDelete(
          this.authCollection(organizationId),
        );
        rt.auth = await useFirestoreAuthState(
          baileys,
          this.authCollection(organizationId),
        );
      }
      const { state, saveCreds } = rt.auth;
      // La version del protocolo cambia seguido; con una antigua WhatsApp
      // rechaza la conexion. Si no se puede consultar, se usa la incluida.
      const version = await baileys
        .fetchLatestBaileysVersion()
        .then((r) => r.version)
        .catch(() => undefined);

      const sock = baileys.default({
        auth: {
          creds: state.creds,
          keys: baileys.makeCacheableSignalKeyStore(state.keys, this.baileysLogger),
        },
        logger: this.baileysLogger,
        browser: baileys.Browsers.ubuntu('GEN-Task'),
        markOnlineOnConnect: false,
        syncFullHistory: false,
        ...(version ? { version } : {}),
      });
      rt.sock = sock;

      sock.ev.on('creds.update', () => {
        saveCreds().catch((err) =>
          this.logger.error(
            `No se pudieron guardar las credenciales de WhatsApp Web (${organizationId}): ${(err as Error).message}`,
          ),
        );
      });
      sock.ev.on('connection.update', (update) => {
        this.onConnectionUpdate(baileys, organizationId, sock, update).catch((err) =>
          this.logger.error(
            `Error manejando conexion de WhatsApp Web (${organizationId}): ${(err as Error).message}`,
          ),
        );
      });
    } catch (err) {
      rt.status = 'DISCONNECTED';
      rt.lastError = (err as Error).message;
      throw err;
    }
  }

  private async onConnectionUpdate(
    baileys: Baileys,
    organizationId: string,
    sock: WASocket,
    update: Partial<ConnectionState>,
  ): Promise<void> {
    const rt = this.sessions.get(organizationId);
    // Eventos de un socket ya reemplazado (reconexion o desvinculacion).
    if (!rt || rt.sock !== sock) return;

    if (update.qr) {
      rt.status = 'QR';
      if (!rt.pairingPhone) {
        rt.qrDataUrl = await QRCode.toDataURL(update.qr, { margin: 1, width: 280 });
      } else if (!rt.pairingRequested) {
        // Vinculacion por codigo: se pide una vez por conexion, cuando el
        // socket ya esta listo para registrarse (primer evento qr).
        rt.pairingRequested = true;
        try {
          rt.pairingCode = await sock.requestPairingCode(rt.pairingPhone);
        } catch (err) {
          rt.lastError = `No se pudo generar el codigo de vinculacion: ${(err as Error).message}`;
          this.closeSocket(rt);
          rt.status = 'DISCONNECTED';
        }
      }
    }

    if (update.connection === 'open') {
      const user = sock.user;
      const pnJid = [user?.phoneNumber, user?.id].find((j) =>
        j?.endsWith('@s.whatsapp.net'),
      );
      rt.status = 'CONNECTED';
      rt.qrDataUrl = undefined;
      rt.pairingCode = undefined;
      rt.pairingPhone = undefined;
      rt.retries = 0;
      rt.lastError = undefined;
      rt.phone = jidToPhone(pnJid);
      rt.name = user?.name ?? user?.notify;
      this.logger.log(
        `WhatsApp Web conectado para ${organizationId} (${rt.phone ?? 'sin numero'}).`,
      );
      await this.collection.doc(organizationId).set(
        {
          organizationId,
          linked: true,
          phone: rt.phone,
          name: rt.name,
          updatedAt: new Date().toISOString(),
        },
        { merge: true },
      );
      return;
    }

    if (update.connection !== 'close') return;

    rt.sock = undefined;
    rt.qrDataUrl = undefined;
    rt.pairingCode = undefined;
    if (rt.stopping) {
      rt.status = 'DISCONNECTED';
      return;
    }

    const { DisconnectReason } = baileys;
    const code = (
      update.lastDisconnect?.error as { output?: { statusCode?: number } } | undefined
    )?.output?.statusCode;
    this.logger.warn(
      `WhatsApp Web de ${organizationId} desconectado (codigo ${code ?? 'desconocido'}).`,
    );

    if (code === DisconnectReason.loggedOut) {
      rt.status = 'DISCONNECTED';
      rt.phone = undefined;
      rt.name = undefined;
      rt.lastError =
        'La sesion se cerro desde el telefono. Vuelve a vincular el numero.';
      rt.auth = undefined;
      await this.clearAuth(organizationId);
      return;
    }
    if (code === DisconnectReason.connectionReplaced) {
      rt.status = 'DISCONNECTED';
      rt.lastError =
        'La sesion se abrio en otro lugar (otra instancia del backend). Reconecta si corresponde.';
      return;
    }
    // Sin vincular: el QR o el codigo expiro sin usarse. Tras vincular,
    // WhatsApp pide reiniciar la conexion (restartRequired) y ahi si se
    // reconecta.
    const paired = rt.auth ? isPaired(rt.auth.state.creds) : false;
    if (!paired && code !== DisconnectReason.restartRequired) {
      rt.status = 'DISCONNECTED';
      rt.lastError = rt.pairingPhone
        ? 'El codigo de vinculacion expiro sin usarse.'
        : 'El codigo QR expiro sin ser escaneado.';
      return;
    }

    rt.status = 'CONNECTING';
    const delay =
      code === DisconnectReason.restartRequired
        ? 0
        : Math.min(MAX_RECONNECT_DELAY_MS, 2_000 * 2 ** rt.retries++);
    rt.reconnectTimer = setTimeout(() => {
      this.start(organizationId).catch((err) =>
        this.logger.error(
          `Reconexion de WhatsApp Web fallida (${organizationId}): ${(err as Error).message}`,
        ),
      );
    }, delay);
  }

  /** Cierra el socket actual sin que su evento de cierre dispare reconexion. */
  private closeSocket(rt: SessionRuntime): void {
    const sock = rt.sock;
    rt.sock = undefined;
    sock?.end(undefined);
  }

  private async clearAuth(organizationId: string): Promise<void> {
    await this.firebase.firestore.recursiveDelete(
      this.authCollection(organizationId),
    );
    await this.collection.doc(organizationId).set(
      {
        organizationId,
        linked: false,
        phone: this.firebase.fieldValue.delete(),
        name: this.firebase.fieldValue.delete(),
        updatedAt: new Date().toISOString(),
      },
      { merge: true },
    );
  }

  private requireSocket(organizationId: string): WASocket {
    this.assertEnabled();
    const rt = this.sessions.get(organizationId);
    if (!rt?.sock || rt.status !== 'CONNECTED') {
      throw new BadRequestException(
        'WhatsApp Web no esta conectado para esta organizacion. Vincula un numero en ChatWhatsapp > WhatsApp Web.',
      );
    }
    return rt.sock;
  }

  private assertEnabled(): void {
    if (!this.enabled) {
      throw new BadRequestException(
        'WhatsApp Web (libreria no oficial) esta deshabilitado en este servidor (WHATSAPP_WEB_ENABLED=false).',
      );
    }
  }
}
