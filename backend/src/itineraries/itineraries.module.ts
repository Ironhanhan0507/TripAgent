import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { PlannerModule } from '../planner/planner.module.js';
import { ItinerariesController } from './itineraries.controller.js';
import { ItinerariesService } from './itineraries.service.js';

@Module({
  imports: [AuthModule, PlannerModule],
  controllers: [ItinerariesController],
  providers: [ItinerariesService],
  exports: [ItinerariesService],
})
export class ItinerariesModule {}
