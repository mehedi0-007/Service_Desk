import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { PaginatedResponse } from '../common/dto/pagination.dto';
import type { AuthenticatedUser } from '../common/types/authenticated-user';
import { ChangeStatusDto } from './dto/change-status.dto';
import { CreateRequestDto } from './dto/create-request.dto';
import { ListRequestsQuery } from './dto/list-requests.query';
import {
  HistoryEntryDto,
  PaginatedRequestsDto,
  RequestDto,
} from './dto/request.response';
import { StatsDto } from './dto/stats.response';
import { UpdateRequestDto } from './dto/update-request.dto';
import { RequestsService } from './requests.service';
import { StatsService } from './stats.service';

@ApiTags('requests')
@ApiBearerAuth()
@Controller('requests')
export class RequestsController {
  constructor(
    private readonly requests: RequestsService,
    private readonly stats: StatsService,
  ) {}

  @Post()
  @Roles(Role.OPERATOR)
  @ApiOperation({ summary: 'Submit a service request for processing' })
  @ApiCreatedResponse({ type: RequestDto })
  create(
    @Body() dto: CreateRequestDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<RequestDto> {
    return this.requests.create(dto, user);
  }

  @Get()
  @ApiOperation({
    summary: 'Search, filter and page requests (operators see their own)',
  })
  @ApiOkResponse({ type: PaginatedRequestsDto })
  list(
    @Query() query: ListRequestsQuery,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<PaginatedResponse<RequestDto>> {
    return this.requests.list(query, user);
  }

  // Declared before ':id' so "stats" is not parsed as a request id.
  @Get('stats')
  @Roles(Role.SUPERVISOR)
  @ApiOperation({ summary: 'Request counts, queue load and processing time' })
  @ApiOkResponse({ type: StatsDto })
  getStats(): Promise<StatsDto> {
    return this.stats.getStats();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get one request' })
  @ApiOkResponse({ type: RequestDto })
  get(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<RequestDto> {
    return this.requests.get(id, user);
  }

  @Get(':id/history')
  @ApiOperation({ summary: 'Status history of a request, oldest first' })
  @ApiOkResponse({ type: HistoryEntryDto, isArray: true })
  history(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<HistoryEntryDto[]> {
    return this.requests.history(id, user);
  }

  @Patch(':id')
  @Roles(Role.SUPERVISOR)
  @ApiOperation({ summary: 'Change priority or assignee' })
  @ApiOkResponse({ type: RequestDto })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateRequestDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<RequestDto> {
    return this.requests.update(id, dto, user);
  }

  @Patch(':id/status')
  @ApiOperation({
    summary: 'Cancel (owner or supervisor) or retry (supervisor) a request',
  })
  @ApiOkResponse({ type: RequestDto })
  changeStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ChangeStatusDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<RequestDto> {
    return this.requests.changeStatus(id, dto, user);
  }
}
