import { Controller, Get, Query } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { Roles } from '../common/decorators/roles.decorator';
import { ListUsersQuery } from './dto/list-users.query';
import { UserDto } from './dto/user.response';
import { UsersService } from './users.service';

@ApiTags('users')
@ApiBearerAuth()
@Controller('users')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get()
  @Roles(Role.SUPERVISOR)
  @ApiOperation({ summary: 'List users, optionally filtered by role' })
  @ApiOkResponse({ type: UserDto, isArray: true })
  list(@Query() query: ListUsersQuery): Promise<UserDto[]> {
    return this.users.list(query.role);
  }
}
