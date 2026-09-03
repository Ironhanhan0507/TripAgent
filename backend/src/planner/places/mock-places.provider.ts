import { Injectable, Logger } from '@nestjs/common';
import { ActivityCategory } from '../types/itinerary.js';
import {
  CostEstimate,
  PlaceDetail,
  PlaceOpeningHours,
  PlaceSummary,
  PlacesProvider,
  TransitResult,
} from './places-provider.types.js';

// ===== Mock 景点目录 =====
// 设计原则：实时景点信息必须来自 Provider，LLM 只能从中选择与编排。
// P2 使用 Mock 目录（确定性数据，离线可跑）；真实 Provider 后续按同一接口替换。

interface CatalogPlace {
  name: string;
  city: string;
  category: ActivityCategory;
  rating: number;
  priceLevel: number;
  tags: string[];
  lat: number;
  lng: number;
  address: string;
  open?: string;
  close?: string;
  closedDays?: number[];
  ticketPrice?: number | null;
  description?: string;
}

interface CityCenter {
  lat: number;
  lng: number;
}

const CITY_CENTERS: Record<string, CityCenter> = {
  成都: { lat: 30.5728, lng: 104.0668 },
  北京: { lat: 39.9042, lng: 116.4074 },
  上海: { lat: 31.2304, lng: 121.4737 },
  东京: { lat: 35.6762, lng: 139.6503 },
  大阪: { lat: 34.6937, lng: 135.5023 },
  京都: { lat: 35.0116, lng: 135.7681 },
  巴黎: { lat: 48.8566, lng: 2.3522 },
  曼谷: { lat: 13.7563, lng: 100.5018 },
  悉尼: { lat: -33.8688, lng: 151.2093 },
  首尔: { lat: 37.5665, lng: 126.978 },
  新加坡: { lat: 1.3521, lng: 103.8198 },
};

const CATALOG: CatalogPlace[] = [
  // ===== 成都 =====
  { name: '成都大熊猫繁育研究基地', city: '成都', category: 'sightseeing', rating: 4.8, priceLevel: 2, tags: ['熊猫', '自然', '亲子'], lat: 30.7356, lng: 104.1444, address: '成华区熊猫大道 1375 号', open: '07:30', close: '18:00', closedDays: [], ticketPrice: 55, description: '近距离观察大熊猫的最佳地点，建议上午前往。' },
  { name: '宽窄巷子', city: '成都', category: 'sightseeing', rating: 4.5, priceLevel: 2, tags: ['历史', '美食', '街区'], lat: 30.6698, lng: 104.059, address: '青羊区长顺街', open: '08:00', close: '22:00', closedDays: [], ticketPrice: 0, description: '成都古街巷代表，集美食与民俗于一体。' },
  { name: '武侯祠', city: '成都', category: 'sightseeing', rating: 4.4, priceLevel: 2, tags: ['历史', '三国'], lat: 30.6457, lng: 104.0478, address: '武侯区武侯祠大街 231 号', open: '08:00', close: '18:30', closedDays: [], ticketPrice: 50, description: '纪念诸葛亮的祠庙，三国文化圣地。' },
  { name: '锦里古街', city: '成都', category: 'sightseeing', rating: 4.4, priceLevel: 2, tags: ['美食', '街区', '夜景'], lat: 30.6441, lng: 104.0472, address: '武侯区武侯祠大街', open: '09:00', close: '22:00', closedDays: [], ticketPrice: 0, description: '民俗小吃街，夜晚灯景迷人。' },
  { name: '人民公园', city: '成都', category: 'sightseeing', rating: 4.3, priceLevel: 1, tags: ['休闲', '茶馆', '慢节奏'], lat: 30.6614, lng: 104.0551, address: '青羊区少城路 12 号', open: '06:30', close: '22:00', closedDays: [], ticketPrice: 0, description: '体验成都慢生活与盖碗茶。' },
  { name: '鹤鸣茶社', city: '成都', category: 'dining', rating: 4.5, priceLevel: 2, tags: ['茶馆', '慢节奏', '美食'], lat: 30.6606, lng: 104.0543, address: '人民公园内', open: '08:00', close: '21:00', closedDays: [], ticketPrice: 0, description: '百年老茶馆，成都闲适文化的缩影。' },
  { name: '陈麻婆豆腐（总店）', city: '成都', category: 'dining', rating: 4.6, priceLevel: 2, tags: ['川菜', '美食'], lat: 30.6512, lng: 104.0771, address: '青羊区西玉龙街 197 号', open: '11:00', close: '21:00', closedDays: [], ticketPrice: 0, description: '麻婆豆腐发源地，正宗川味。' },
  { name: '太古里', city: '成都', category: 'shopping', rating: 4.6, priceLevel: 3, tags: ['购物', '时尚', '美食'], lat: 30.6536, lng: 104.0813, address: '锦江区中纱帽街 8 号', open: '10:00', close: '22:00', closedDays: [], ticketPrice: 0, description: '开放式街区商业体，潮人聚集地。' },
  { name: '成都香格里拉大酒店', city: '成都', category: 'hotel', rating: 4.7, priceLevel: 4, tags: ['住宿', '高端'], lat: 30.6419, lng: 104.078, address: '锦江区滨江东路 9 号', open: '00:00', close: '23:59', closedDays: [], ticketPrice: 0, description: '河景五星酒店，位置便利。' },
  // ===== 北京 =====
  { name: '故宫博物院', city: '北京', category: 'sightseeing', rating: 4.9, priceLevel: 2, tags: ['历史', '古迹', '拍照'], lat: 39.9163, lng: 116.3972, address: '东城区景山前街 4 号', open: '08:30', close: '17:00', closedDays: [1], ticketPrice: 60, description: '明清皇宫，必访的世界文化遗产。' },
  { name: '八达岭长城', city: '北京', category: 'sightseeing', rating: 4.8, priceLevel: 2, tags: ['历史', '古迹', '自然'], lat: 40.3592, lng: 116.0186, address: '延庆区军都山关沟古道北口', open: '07:30', close: '16:30', closedDays: [], ticketPrice: 40, description: '世界最著名长城段落之一。' },
  { name: '颐和园', city: '北京', category: 'sightseeing', rating: 4.7, priceLevel: 2, tags: ['历史', '自然', '拍照'], lat: 39.9996, lng: 116.2755, address: '海淀区新建宫门路 19 号', open: '06:30', close: '18:00', closedDays: [], ticketPrice: 30, description: '皇家园林典范，昆明湖与万寿山。' },
  { name: '天坛公园', city: '北京', category: 'sightseeing', rating: 4.6, priceLevel: 2, tags: ['历史', '古迹'], lat: 39.8822, lng: 116.4066, address: '东城区天坛东里甲 1 号', open: '06:00', close: '21:00', closedDays: [], ticketPrice: 15, description: '明清皇帝祭天之所。' },
  { name: '南锣鼓巷', city: '北京', category: 'sightseeing', rating: 4.3, priceLevel: 2, tags: ['街区', '美食', '拍照'], lat: 39.938, lng: 116.4038, address: '东城区南锣鼓巷', open: '10:00', close: '22:00', closedDays: [], ticketPrice: 0, description: '北京特色胡同街区。' },
  { name: '四季民福烤鸭店', city: '北京', category: 'dining', rating: 4.6, priceLevel: 3, tags: ['烤鸭', '美食'], lat: 39.9159, lng: 116.4087, address: '东城区灯市口大街 33 号', open: '11:00', close: '21:30', closedDays: [], ticketPrice: 0, description: '本地人推荐烤鸭店，故宫店可赏景。' },
  { name: '王府井大街', city: '北京', category: 'shopping', rating: 4.4, priceLevel: 3, tags: ['购物', '美食'], lat: 39.9146, lng: 116.4115, address: '东城区王府井大街', open: '10:00', close: '22:00', closedDays: [], ticketPrice: 0, description: '北京老牌商业街。' },
  { name: '北京饭店', city: '北京', category: 'hotel', rating: 4.5, priceLevel: 4, tags: ['住宿'], lat: 39.9109, lng: 116.4102, address: '东城区东长安街 33 号', open: '00:00', close: '23:59', closedDays: [], ticketPrice: 0, description: '长安街地标酒店。' },
  // ===== 东京 =====
  { name: '东京晴空塔', city: '东京', category: 'sightseeing', rating: 4.6, priceLevel: 3, tags: ['地标', '拍照', '夜景'], lat: 35.7101, lng: 139.8107, address: '墨田区押上 1-1-2', open: '10:00', close: '21:00', closedDays: [], ticketPrice: 2100, description: '世界最高电波塔，观景台俯瞰东京。' },
  { name: '浅草寺', city: '东京', category: 'sightseeing', rating: 4.6, priceLevel: 1, tags: ['历史', '拍照', '街区'], lat: 35.7148, lng: 139.7967, address: '台东区浅草 2-3-1', open: '06:00', close: '17:00', closedDays: [], ticketPrice: 0, description: '东京最古老寺庙，雷门与仲见世通。' },
  { name: '秋叶原', city: '东京', category: 'shopping', rating: 4.5, priceLevel: 2, tags: ['动漫', '购物', '二次元'], lat: 35.6984, lng: 139.7731, address: '千代田区外神田', open: '10:00', close: '21:00', closedDays: [], ticketPrice: 0, description: '动漫圣地，电器与手办集中地。' },
  { name: '涩谷', city: '东京', category: 'shopping', rating: 4.5, priceLevel: 3, tags: ['购物', '时尚', '美食'], lat: 35.6595, lng: 139.7005, address: '涩谷区道玄坂', open: '10:00', close: '22:00', closedDays: [], ticketPrice: 0, description: '潮流与美食中心，忠犬八公像。' },
  { name: '上野公园', city: '东京', category: 'sightseeing', rating: 4.4, priceLevel: 1, tags: ['自然', '博物馆', '休闲'], lat: 35.7155, lng: 139.7744, address: '台东区上野公园', open: '05:00', close: '23:00', closedDays: [], ticketPrice: 0, description: '赏樱名所，周边博物馆云集。' },
  { name: '一兰拉面（新宿店）', city: '东京', category: 'dining', rating: 4.5, priceLevel: 2, tags: ['拉面', '美食'], lat: 35.6938, lng: 139.7034, address: '新宿区新宿 3-34-11', open: '10:00', close: '23:00', closedDays: [], ticketPrice: 0, description: '博多豚骨拉面代表。' },
  { name: '东京皇宫酒店', city: '东京', category: 'hotel', rating: 4.7, priceLevel: 5, tags: ['住宿', '高端'], lat: 35.6885, lng: 139.7556, address: '千代田区丸之内 1-1-1', open: '00:00', close: '23:59', closedDays: [], ticketPrice: 0, description: '俯瞰皇居护城河的奢华酒店。' },
  { name: '新宿御苑', city: '东京', category: 'sightseeing', rating: 4.5, priceLevel: 1, tags: ['自然', '拍照', '休闲'], lat: 35.6852, lng: 139.7098, address: '新宿区内藤町 11', open: '09:00', close: '18:00', closedDays: [1], ticketPrice: 500, description: '日式庭园与法式庭园结合。' },
  // ===== 上海 =====
  { name: '外滩', city: '上海', category: 'sightseeing', rating: 4.8, priceLevel: 1, tags: ['地标', '拍照', '夜景'], lat: 31.24, lng: 121.4906, address: '黄浦区中山东一路', open: '00:00', close: '23:59', closedDays: [], ticketPrice: 0, description: '万国建筑博览群与陆家嘴天际线隔江相望，夜景最佳。' },
  { name: '东方明珠广播电视塔', city: '上海', category: 'sightseeing', rating: 4.5, priceLevel: 3, tags: ['地标', '拍照'], lat: 31.2397, lng: 121.4998, address: '浦东新区世纪大道 1 号', open: '08:00', close: '21:30', closedDays: [], ticketPrice: 220, description: '陆家嘴标志建筑，高空观光厅俯瞰全城。' },
  { name: '豫园', city: '上海', category: 'sightseeing', rating: 4.6, priceLevel: 2, tags: ['历史', '园林', '拍照'], lat: 31.2272, lng: 121.492, address: '黄浦区福佑路 168 号', open: '09:00', close: '16:30', closedDays: [1], ticketPrice: 40, description: '明代古典园林，亭台楼阁错落有致。' },
  { name: '上海博物馆', city: '上海', category: 'sightseeing', rating: 4.7, priceLevel: 1, tags: ['博物馆', '历史'], lat: 31.2304, lng: 121.4737, address: '黄浦区人民大道 201 号', open: '09:00', close: '17:00', closedDays: [1], ticketPrice: 0, description: '青铜器与书画馆藏闻名，免费预约参观。' },
  { name: '南京路步行街', city: '上海', category: 'shopping', rating: 4.5, priceLevel: 3, tags: ['购物', '美食', '夜景'], lat: 31.2343, lng: 121.4748, address: '黄浦区南京东路', open: '10:00', close: '22:00', closedDays: [], ticketPrice: 0, description: '百年商业街，老字号与潮流品牌汇聚。' },
  { name: '南翔馒头店（豫园店）', city: '上海', category: 'dining', rating: 4.5, priceLevel: 2, tags: ['小笼包', '美食'], lat: 31.2275, lng: 121.4913, address: '黄浦区豫园路 85 号', open: '07:00', close: '20:30', closedDays: [], ticketPrice: 0, description: '上海小笼包老字号，皮薄馅鲜。' },
  { name: '田子坊', city: '上海', category: 'shopping', rating: 4.3, priceLevel: 2, tags: ['街区', '文艺', '手作'], lat: 31.2124, lng: 121.4652, address: '黄浦区泰康路 210 弄', open: '10:00', close: '21:00', closedDays: [], ticketPrice: 0, description: '石库门里弄改造的创意街区。' },
  { name: '上海和平饭店', city: '上海', category: 'hotel', rating: 4.7, priceLevel: 5, tags: ['住宿', '高端'], lat: 31.2424, lng: 121.49, address: '黄浦区南京东路 20 号', open: '00:00', close: '23:59', closedDays: [], ticketPrice: 0, description: '外滩地标传奇酒店，俯瞰黄浦江。' },
  // ===== 巴黎 =====
  { name: '埃菲尔铁塔', city: '巴黎', category: 'sightseeing', rating: 4.7, priceLevel: 3, tags: ['地标', '拍照', '夜景'], lat: 48.8584, lng: 2.2945, address: 'Champ de Mars, 5 Av. Anatole France', open: '09:30', close: '23:00', closedDays: [], ticketPrice: 190, description: '巴黎象征，登顶可俯瞰全城。' },
  { name: '卢浮宫', city: '巴黎', category: 'sightseeing', rating: 4.8, priceLevel: 3, tags: ['博物馆', '艺术', '历史'], lat: 48.8606, lng: 2.3376, address: 'Rue de Rivoli, 75001', open: '09:00', close: '18:00', closedDays: [2], ticketPrice: 170, description: '世界最大艺术博物馆，蒙娜丽莎所在。' },
  { name: '巴黎圣母院', city: '巴黎', category: 'sightseeing', rating: 4.6, priceLevel: 1, tags: ['历史', '建筑', '拍照'], lat: 48.853, lng: 2.3499, address: '6 Parvis Notre-Dame', open: '08:00', close: '18:45', closedDays: [], ticketPrice: 0, description: '哥特式建筑杰作，免费参观。' },
  { name: '奥赛博物馆', city: '巴黎', category: 'sightseeing', rating: 4.7, priceLevel: 3, tags: ['博物馆', '印象派', '艺术'], lat: 48.86, lng: 2.3266, address: 'Esplanade Valéry Giscard dEstaing', open: '09:30', close: '18:00', closedDays: [1], ticketPrice: 160, description: '印象派与后印象派杰作殿堂。' },
  { name: '蒙马特高地', city: '巴黎', category: 'sightseeing', rating: 4.5, priceLevel: 1, tags: ['街区', '拍照', '文艺'], lat: 48.8867, lng: 2.3431, address: '18e arrondissement', open: '00:00', close: '23:59', closedDays: [], ticketPrice: 0, description: '艺术家聚集地，圣心堂与街巷风光。' },
  { name: '香榭丽舍大街', city: '巴黎', category: 'shopping', rating: 4.5, priceLevel: 4, tags: ['购物', '美食', '街区'], lat: 48.8698, lng: 2.3078, address: 'Avenue des Champs-Élysées', open: '10:00', close: '21:00', closedDays: [], ticketPrice: 0, description: '世界最著名大道，凯旋门到协和广场。' },
  { name: '花神咖啡馆', city: '巴黎', category: 'dining', rating: 4.4, priceLevel: 3, tags: ['咖啡', '法餐', '文艺'], lat: 48.8539, lng: 2.3322, address: '172 Bd Saint-Germain', open: '07:30', close: '01:30', closedDays: [], ticketPrice: 0, description: '萨特与波伏娃常驻的百年咖啡馆。' },
  { name: '巴黎歌剧院酒店', city: '巴黎', category: 'hotel', rating: 4.6, priceLevel: 5, tags: ['住宿', '高端'], lat: 48.8722, lng: 2.3316, address: '1 Rue Scribe, 75009', open: '00:00', close: '23:59', closedDays: [], ticketPrice: 0, description: '紧邻加尼叶歌剧院，古典奢华。' },
  // ===== 曼谷 =====
  { name: '大皇宫', city: '曼谷', category: 'sightseeing', rating: 4.7, priceLevel: 3, tags: ['历史', '建筑', '拍照'], lat: 13.75, lng: 100.4913, address: 'Na Phra Lan Rd, Phra Nakhon', open: '08:30', close: '15:30', closedDays: [], ticketPrice: 500, description: '泰国王室宫殿群，金碧辉煌。' },
  { name: '郑王庙（黎明寺）', city: '曼谷', category: 'sightseeing', rating: 4.6, priceLevel: 2, tags: ['历史', '拍照', '地标'], lat: 13.7437, lng: 100.4891, address: '158 Thanon Wang Doem', open: '08:00', close: '18:00', closedDays: [], ticketPrice: 100, description: '昭披耶河畔的高棉式佛塔。' },
  { name: '卧佛寺', city: '曼谷', category: 'sightseeing', rating: 4.5, priceLevel: 2, tags: ['历史', '佛教', '拍照'], lat: 13.7467, lng: 100.4889, address: '2 Sanam Chai Rd', open: '08:00', close: '18:30', closedDays: [], ticketPrice: 200, description: '供奉巨型卧佛，泰式按摩发源地。' },
  { name: '四面佛', city: '曼谷', category: 'sightseeing', rating: 4.5, priceLevel: 1, tags: ['祈福', '地标'], lat: 13.7449, lng: 100.5404, address: 'Ratchadamri Rd, Lumphini', open: '06:00', close: '23:00', closedDays: [], ticketPrice: 0, description: '香火极盛的四面佛坛，位于市中心。' },
  { name: '暹罗广场', city: '曼谷', category: 'shopping', rating: 4.5, priceLevel: 3, tags: ['购物', '美食', '时尚'], lat: 13.7458, lng: 100.5344, address: 'Pathum Wan, Bangkok 10330', open: '10:00', close: '22:00', closedDays: [], ticketPrice: 0, description: '曼谷潮流中心，商场与美食云集。' },
  { name: '恰图恰周末市场', city: '曼谷', category: 'shopping', rating: 4.6, priceLevel: 2, tags: ['购物', '手作', '美食'], lat: 13.7996, lng: 100.5478, address: 'Kamphaeng Phet Rd', open: '09:00', close: '18:00', closedDays: [1, 2, 3, 4, 5], ticketPrice: 0, description: '世界最大周末市集，仅周六日开放。' },
  { name: '建兴酒家（咖喱蟹）', city: '曼谷', category: 'dining', rating: 4.5, priceLevel: 3, tags: ['泰餐', '海鲜', '美食'], lat: 13.7561, lng: 100.5398, address: '895/6-21 Soi Chula 8', open: '16:00', close: '23:30', closedDays: [], ticketPrice: 0, description: '招牌咖喱炒蟹，游客与本地人皆爱。' },
  { name: '曼谷文华东方酒店', city: '曼谷', category: 'hotel', rating: 4.8, priceLevel: 5, tags: ['住宿', '高端'], lat: 13.7237, lng: 100.5137, address: '48 Oriental Ave, Bang Rak', open: '00:00', close: '23:59', closedDays: [], ticketPrice: 0, description: '昭披耶河畔百年传奇酒店。' },
  // ===== 悉尼 =====
  { name: '悉尼歌剧院', city: '悉尼', category: 'sightseeing', rating: 4.8, priceLevel: 3, tags: ['地标', '建筑', '拍照'], lat: -33.8568, lng: 151.2153, address: 'Bennelong Point, Sydney NSW', open: '09:00', close: '17:00', closedDays: [], ticketPrice: 190, description: '世界文化遗产，帆船造型地标。' },
  { name: '悉尼海港大桥', city: '悉尼', category: 'sightseeing', rating: 4.7, priceLevel: 2, tags: ['地标', '拍照', '徒步'], lat: -33.8523, lng: 151.2108, address: 'Sydney Harbour Bridge', open: '00:00', close: '23:59', closedDays: [], ticketPrice: 0, description: '可步行过桥，或攀桥俯瞰港湾。' },
  { name: '邦迪海滩', city: '悉尼', category: 'sightseeing', rating: 4.6, priceLevel: 1, tags: ['海滩', '冲浪', '休闲'], lat: -33.8908, lng: 151.2743, address: 'Bondi Beach NSW 2026', open: '00:00', close: '23:59', closedDays: [], ticketPrice: 0, description: '悉尼最著名海滩，冲浪胜地。' },
  { name: '悉尼塔观景台', city: '悉尼', category: 'sightseeing', rating: 4.4, priceLevel: 3, tags: ['地标', '拍照', '夜景'], lat: -33.8705, lng: 151.2086, address: '100 Market St, Sydney NSW', open: '09:00', close: '21:30', closedDays: [], ticketPrice: 130, description: '市中心高空 360° 观景。' },
  { name: '岩石区', city: '悉尼', category: 'shopping', rating: 4.5, priceLevel: 2, tags: ['街区', '历史', '手作'], lat: -33.8587, lng: 151.2084, address: 'The Rocks NSW 2000', open: '10:00', close: '18:00', closedDays: [], ticketPrice: 0, description: '悉尼最早街区，周末市集与老酒吧。' },
  { name: '悉尼鱼市场', city: '悉尼', category: 'dining', rating: 4.5, priceLevel: 2, tags: ['海鲜', '美食'], lat: -33.8729, lng: 151.1932, address: 'Bank St, Pyrmont NSW', open: '07:00', close: '16:00', closedDays: [], ticketPrice: 0, description: '南半球最大鱼市场，现买现做。' },
  { name: '达令港', city: '悉尼', category: 'shopping', rating: 4.5, priceLevel: 3, tags: ['购物', '美食', '夜景'], lat: -33.8731, lng: 151.1988, address: 'Darling Harbour NSW 2000', open: '10:00', close: '22:00', closedDays: [], ticketPrice: 0, description: '海滨娱乐区，水族馆与餐厅齐聚。' },
  { name: '悉尼四季酒店', city: '悉尼', category: 'hotel', rating: 4.6, priceLevel: 5, tags: ['住宿', '高端'], lat: -33.856, lng: 151.206, address: '199 George St, Sydney NSW', open: '00:00', close: '23:59', closedDays: [], ticketPrice: 0, description: '岩石区地标酒店，港湾景观。' },
];

// 通用兜底：任意城市生成一组确定性景点（坐标围绕城市中心散开）
const GENERIC_NAMES: Array<{ name: string; category: ActivityCategory; tags: string[]; rating: number; priceLevel: number }> = [
  { name: '城市中央公园', category: 'sightseeing', tags: ['自然', '休闲', '拍照'], rating: 4.3, priceLevel: 1 },
  { name: '老城历史街区', category: 'sightseeing', tags: ['历史', '街区', '拍照'], rating: 4.4, priceLevel: 1 },
  { name: '市政博物馆', category: 'sightseeing', tags: ['历史', '博物馆'], rating: 4.2, priceLevel: 2 },
  { name: '城市地标观景台', category: 'sightseeing', tags: ['地标', '拍照', '夜景'], rating: 4.5, priceLevel: 3 },
  { name: '本地风味餐厅', category: 'dining', tags: ['美食'], rating: 4.4, priceLevel: 2 },
  { name: '传统小吃街', category: 'dining', tags: ['美食', '街区'], rating: 4.5, priceLevel: 1 },
  { name: '中心购物广场', category: 'shopping', tags: ['购物'], rating: 4.2, priceLevel: 3 },
  { name: '河畔精品酒店', category: 'hotel', tags: ['住宿'], rating: 4.4, priceLevel: 3 },
];

@Injectable()
export class MockPlacesProvider implements PlacesProvider {
  readonly name = 'mock-places';

  private readonly logger = new Logger(MockPlacesProvider.name);

  async searchPlaces(input: {
    query?: string;
    city: string;
    category?: ActivityCategory;
    limit?: number;
  }): Promise<PlaceSummary[]> {
    const { city, category, limit = 10 } = input;
    const pool = this.poolFor(city);
    let places = pool.filter((p) => p.city === city);
    if (category) places = places.filter((p) => p.category === category);
    if (input.query?.trim()) {
      const q = input.query.trim().toLowerCase();
      places = places.filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          p.tags.some((t) => t.toLowerCase().includes(q)) ||
          p.category.includes(q),
      );
    }
    places = [...places].sort((a, b) => b.rating - a.rating).slice(0, limit);
    this.logger.log(`search_places(city=${city}, cat=${category ?? '-'}) → ${places.length} 条`);
    return places.map((p) => this.toSummary(p));
  }

  async getPlaceDetail(placeId: string): Promise<PlaceDetail | null> {
    const place = this.findById(placeId);
    if (!place) return null;
    return {
      ...this.toSummary(place),
      openingHours: place.open && place.close ? { open: place.open, close: place.close, closedDays: place.closedDays ?? [] } : null,
      ticketPrice: place.ticketPrice ?? null,
      description: place.description ?? '',
    };
  }

  // 直线距离 + 分交通方式的耗时估算（Mock）
  async calculateTransit(
    from: { lat: number; lng: number },
    to: { lat: number; lng: number },
    mode = 'public',
  ): Promise<TransitResult> {
    const distanceKm = this.haversineKm(from.lat, from.lng, to.lat, to.lng);
    const speeds: Record<string, number> = { walking: 4.8, taxi: 28, car: 26, public: 26, mixed: 26 };
    const speed = speeds[mode] ?? 26;
    const travelMin = (distanceKm / speed) * 60;
    const bufferMin = mode === 'public' ? 12 : 5; // 等车/换乘缓冲
    const durationMin = Math.max(8, Math.round(travelMin + bufferMin));
    return { distanceKm: Math.round(distanceKm * 10) / 10, durationMin };
  }

  async checkOpeningHours(
    placeId: string,
    date?: string,
  ): Promise<{ open: string; close: string; isOpenOnDate: boolean; note: string } | null> {
    const place = this.findById(placeId);
    if (!place?.open || !place.close) return null;
    const closedDays = place.closedDays ?? [];
    let isOpen = true;
    let note = '营业中';
    if (date) {
      const weekday = new Date(date + 'T00:00:00').getDay(); // 0=周日
      if (closedDays.includes(weekday)) {
        isOpen = false;
        note = '当日闭馆';
      }
    }
    return { open: place.open, close: place.close, isOpenOnDate: isOpen, note };
  }

  async estimateCost(input: {
    days: number;
    travelers: number;
    preferences: string[];
    budget?: number | null;
    currency?: string;
  }): Promise<CostEstimate> {
    const { days, travelers, preferences, currency = 'CNY' } = input;
    const hasShopping = preferences.some((p) => ['购物', '动漫', '拍照'].includes(p));
    const hasDining = preferences.some((p) => ['美食', '餐饮'].includes(p));
    // 每人每天分类估算（元）
    const perPerson: Record<ActivityCategory, number> = {
      sightseeing: 150,
      dining: hasDining ? 220 : 150,
      shopping: hasShopping ? 300 : 100,
      transport: 80,
      hotel: 400,
      other: 100,
    };
    const perDay = (Object.keys(perPerson) as ActivityCategory[]).map((category) => ({
      category,
      amount: Math.round(perPerson[category] * travelers),
    }));
    const total = perDay.reduce((s, d) => s + d.amount, 0) * days;
    return { perDay, total, currency };
  }

  // ===== 内部 =====
  private poolFor(city: string): CatalogPlace[] {
    if (CATALOG.some((p) => p.city === city)) return CATALOG;
    // 无精编目录 → 生成通用目录（含酒店）
    const center = CITY_CENTERS[city] ?? { lat: 30 + (city.length % 10), lng: 110 + (city.length % 20) };
    return GENERIC_NAMES.map((g, i) => ({
      ...g,
      city,
      lat: center.lat + (i % 4) * 0.03 - 0.03,
      lng: center.lng + Math.floor(i / 4) * 0.03 - 0.03,
      address: `${city}${g.name}`,
      open: g.category === 'dining' ? '11:00' : '08:00',
      close: g.category === 'sightseeing' ? '18:00' : '21:00',
      closedDays: g.category === 'sightseeing' ? [1] : [],
      ticketPrice: g.category === 'sightseeing' && g.rating >= 4.5 ? 50 : null,
      description: `${city}的${g.name}，适合${g.tags.join('/')}。`,
    }));
  }

  private toSummary(p: CatalogPlace): PlaceSummary {
    return {
      placeId: this.idOf(p),
      name: p.name,
      city: p.city,
      category: p.category,
      rating: p.rating,
      priceLevel: p.priceLevel,
      tags: p.tags,
      lat: p.lat,
      lng: p.lng,
      address: p.address,
      openingHours: p.open && p.close ? { open: p.open, close: p.close, closedDays: p.closedDays ?? [] } : null,
    };
  }

  private idOf(p: CatalogPlace): string {
    return `place-${p.city}-${p.category}-${p.name}`;
  }

  private findById(placeId: string): CatalogPlace | null {
    // 精编目录
    const curated = CATALOG.find((p) => this.idOf(p) === placeId);
    if (curated) return curated;
    // 通用目录：解析 id → 城市/分类/名称
    const m = /^place-(.+)-(.+)-(.+)$/.exec(placeId);
    if (!m) return null;
    const [, city, category, name] = m;
    const gen = GENERIC_NAMES.find((g) => g.name === name && g.category === category);
    if (!gen) return null;
    return this.poolFor(city).find((p) => p.name === name) ?? null;
  }

  private haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
    const R = 6371;
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLng = ((lng2 - lng1) * Math.PI) / 180;
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(a));
  }
}
