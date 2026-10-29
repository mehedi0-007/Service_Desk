import { HttpStatus, Injectable } from '@nestjs/common';
import { Role, User } from '@prisma/client';
import { AppException, ErrorCode } from '../common/errors/app-error';
import { PrismaService } from '../prisma/prisma.service';
import { UserDto } from './dto/user.response';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  findById(id: string): Promise<User | null> {
    return this.prisma.user.findUnique({ where: { id } });
  }

  findByEmail(email: string): Promise<User | null> {
    return this.prisma.user.findUnique({ where: { email } });
  }

  async updatePassword(id: string, passwordHash: string): Promise<void> {
    await this.prisma.user.update({ where: { id }, data: { passwordHash } });
  }

  async list(role?: Role): Promise<UserDto[]> {
    const users = await this.prisma.user.findMany({
      where: role ? { role } : undefined,
      orderBy: { name: 'asc' },
    });
    return users.map((user) => this.toDto(user));
  }

  async assertSupervisor(id: string): Promise<void> {
    const user = await this.findById(id);
    if (user?.role !== Role.SUPERVISOR) {
      throw new AppException(
        ErrorCode.BAD_REQUEST,
        'Assignee must be a supervisor',
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  toDto(user: User): UserDto {
    return { id: user.id, email: user.email, name: user.name, role: user.role };
  }
}
