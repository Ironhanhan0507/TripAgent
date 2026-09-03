import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { AgentModule } from '../agent/agent.module.js';
import { ChatController } from './chat.controller.js';

@Module({
  imports: [AuthModule, AgentModule],
  controllers: [ChatController],
})
export class ChatModule {}
