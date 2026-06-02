import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { UserRole } from '@gen-task/shared';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { UsersService } from './users.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { CreateMembershipDto } from './dto/create-membership.dto';

/**
 * Gestion de usuarios y membresias. La creacion de usuarios (admins) es
 * exclusiva del SUPER_ADMIN. Las membresias las gestiona SUPER_ADMIN o ADMIN.
 */
@Controller()
@UseGuards(RolesGuard)
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get('users')
  @Roles(UserRole.SUPER_ADMIN)
  findAll() {
    return this.users.findAll();
  }

  @Post('users')
  @Roles(UserRole.SUPER_ADMIN)
  create(@Body() dto: CreateUserDto) {
    return this.users.create(dto);
  }

  @Get('users/:id')
  @Roles(UserRole.SUPER_ADMIN)
  findOne(@Param('id') id: string) {
    return this.users.findOne(id);
  }

  @Patch('users/:id')
  @Roles(UserRole.SUPER_ADMIN)
  update(@Param('id') id: string, @Body() dto: UpdateUserDto) {
    return this.users.update(id, dto);
  }

  @Patch('users/:id/archive')
  @Roles(UserRole.SUPER_ADMIN)
  archive(@Param('id') id: string) {
    return this.users.archive(id);
  }

  /** Asignar admins/gestores a organizaciones. */
  @Post('memberships')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  createMembership(@Body() dto: CreateMembershipDto) {
    return this.users.createMembership(dto);
  }

  @Patch('memberships/:id/archive')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  archiveMembership(@Param('id') id: string) {
    return this.users.archiveMembership(id);
  }
}
