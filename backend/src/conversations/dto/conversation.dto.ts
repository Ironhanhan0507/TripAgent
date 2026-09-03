import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateConversationDto {
  @IsOptional()
  @IsString()
  @MaxLength(100, { message: '标题过长（最多 100 字）' })
  title?: string;
}

export class SendMessageDto {
  @IsString()
  @IsNotEmpty({ message: '消息不能为空' })
  @MaxLength(2000, { message: '消息过长（最多 2000 字）' })
  content!: string;
}
