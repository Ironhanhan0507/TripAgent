import { Body, Controller, Delete, Get, Param, Patch, Post, Put, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/auth.guard.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import type { AuthUser } from '../auth/auth.service.js';
import { ItinerariesService } from './itineraries.service.js';
import {
  SaveItineraryDto,
  UpdateActivityDto,
  UpdateItineraryDto,
  ValidateItineraryDto,
} from './dto/itinerary.dto.js';

// P4：行程 CRUD API。
@Controller('itineraries')
@UseGuards(JwtAuthGuard)
export class ItinerariesController {
  constructor(private readonly service: ItinerariesService) {}

  @Post()
  save(@Body() dto: SaveItineraryDto, @CurrentUser() user: AuthUser) {
    return this.service.save(user.id, dto);
  }

  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.service.list(user.id);
  }

  @Get(':id')
  detail(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.service.detail(user.id, id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateItineraryDto, @CurrentUser() user: AuthUser) {
    return this.service.update(user.id, id, dto);
  }

  @Delete(':id')
  async remove(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    await this.service.remove(user.id, id);
    return { success: true };
  }

  // 编辑单个活动（设计文档 §7.4）
  @Put(':id/days/:dayId/activities/:activityId')
  updateActivity(
    @Param('id') id: string,
    @Param('dayId') dayId: string,
    @Param('activityId') activityId: string,
    @Body() dto: UpdateActivityDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.updateActivity(user.id, id, dayId, activityId, dto);
  }

  // 手动触发校验（设计文档 §7.4）
  @Post(':id/validate')
  validate(
    @Param('id') id: string,
    @Body() dto: ValidateItineraryDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.validate(user.id, id, dto);
  }
}
