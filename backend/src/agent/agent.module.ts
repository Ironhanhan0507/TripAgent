import { Module } from '@nestjs/common';
import { LlmModule } from '../llm/llm.module.js';
import { PlannerModule } from '../planner/planner.module.js';
import { AgentOrchestrator } from './orchestrator.service.js';
import { RequirementParser } from './parser/requirement-parser.service.js';

@Module({
  imports: [LlmModule, PlannerModule],
  providers: [AgentOrchestrator, RequirementParser],
  exports: [AgentOrchestrator],
})
export class AgentModule {}
