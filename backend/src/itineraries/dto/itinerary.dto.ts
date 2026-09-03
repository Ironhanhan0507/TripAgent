import {
  IsIn,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

// P4：行程保存 DTO。itineraryData 与 requirement 为结构化 JSON（与 Planner 输出对齐），
// 后端做运行时校验后写入 JSONB，避免前端类型不可信。
export class SaveItineraryDto {
  @IsOptional()
  @IsString()
  conversationId?: string;

  @IsString()
  @IsNotEmpty({ message: '标题不能为空' })
  @MaxLength(100, { message: '标题过长（最多 100 字）' })
  title!: string;

  @IsString()
  @IsNotEmpty({ message: '目的地不能为空' })
  destination!: string;

  @IsString()
  @IsNotEmpty({ message: '开始日期不能为空' })
  startDate!: string;

  @IsString()
  @IsNotEmpty({ message: '结束日期不能为空' })
  endDate!: string;

  @IsOptional()
  @IsNumber()
  totalBudget?: number;

  @IsOptional()
  @IsString()
  currency?: string;

  @IsOptional()
  @IsString()
  status?: 'saved' | 'draft';

  @IsObject()
  itineraryData!: Record<string, unknown>;

  @IsOptional()
  @IsObject()
  requirement?: Record<string, unknown> | null;
}

// 编辑 DTO：只允许更新部分字段（标题 / 状态 / 行程数据 / 版本自增）。
export class UpdateItineraryDto {
  @IsOptional()
  @IsString()
  @MaxLength(100, { message: '标题过长（最多 100 字）' })
  title?: string;

  @IsOptional()
  @IsString()
  destination?: string;

  @IsOptional()
  @IsString()
  startDate?: string;

  @IsOptional()
  @IsString()
  endDate?: string;

  @IsOptional()
  @IsNumber()
  totalBudget?: number;

  @IsOptional()
  @IsString()
  currency?: string;

  @IsOptional()
  @IsString()
  status?: 'saved' | 'draft';

  @IsOptional()
  @IsObject()
  itineraryData?: Record<string, unknown>;

  @IsOptional()
  @IsObject()
  requirement?: Record<string, unknown> | null;
}

// 增量重规划请求：携带已编辑的行程 + 原始需求 + 用户反馈说明。
export class ReplanItineraryDto {
  @IsObject()
  itinerary!: Record<string, unknown>;

  @IsObject()
  requirement!: Record<string, unknown>;

  @IsOptional()
  @IsString()
  note?: string;

  @IsOptional()
  @IsString()
  conversationId?: string;
}

// 单活动编辑（设计文档 §7.4）：部分更新 Activity 字段。
export class UpdateActivityDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  placeId?: string;

  @IsOptional()
  @IsString()
  startTime?: string;

  @IsOptional()
  @IsString()
  endTime?: string;

  @IsOptional()
  @IsNumber()
  durationMin?: number;

  @IsOptional()
  @IsNumber()
  cost?: number;

  @IsOptional()
  @IsIn(['sightseeing', 'dining', 'shopping', 'transport', 'hotel', 'other'])
  category?: string;

  @IsOptional()
  @IsString()
  transportNote?: string;

  @IsOptional()
  @IsInt()
  orderIndex?: number;

  @IsOptional()
  @IsString()
  note?: string;

  @IsOptional()
  @IsNumber()
  lat?: number;

  @IsOptional()
  @IsNumber()
  lng?: number;
}

// 手动校验请求：可选携带当前编辑中的行程草稿，未携带则校验已保存版本。
export class ValidateItineraryDto {
  @IsOptional()
  @IsObject()
  itinerary?: Record<string, unknown>;
}
