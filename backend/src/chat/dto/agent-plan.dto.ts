import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class AgentPlanDto {
  @IsString()
  @IsNotEmpty({ message: '缺少会话 ID' })
  conversationId!: string;

  @IsString()
  @IsNotEmpty({ message: '消息不能为空' })
  @MaxLength(2000, { message: '消息过长（最多 2000 字）' })
  message!: string;
}
