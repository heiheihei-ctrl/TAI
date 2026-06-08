// 支付方式枚举
export enum PaymentMethod {
  ALIPAY = 'alipay',
  WECHAT = 'wechat',
}

// 订单状态枚举
export enum PaymentStatus {
  PENDING = 'pending',
  PAID = 'paid',
  FAILED = 'failed',
  EXPIRED = 'expired',
  CANCELLED = 'cancelled',
}

export type PaymentOrderType = 'recharge' | 'membership';

// 创建订单请求
export interface CreateOrderDto {
  amount: number;      // 支付金额（元）
  credits: number;     // 获得积分
  paymentMethod: PaymentMethod;
  orderType?: PaymentOrderType;
  membershipPlanId?: string;
  metadata?: Record<string, unknown>;
}

// 订单响应
export interface PaymentOrderResponse {
  orderId: string;
  orderNo: string;
  amount: number;
  credits: number;
  paymentMethod: PaymentMethod;
  orderType: PaymentOrderType;
  businessCode?: string | null;
  status: PaymentStatus;
  qrCodeUrl: string | null;
  expiredAt: Date;
  createdAt: Date;
  membershipPlanId?: string | null;
}

// 支付状态查询响应
export interface PaymentStatusResponse {
  orderNo: string;
  status: PaymentStatus;
  paidAt: Date | null;
  credits: number;
  orderType?: PaymentOrderType;
  membershipPlanId?: string | null;
  subscriptionId?: string | null;
}

// 充值套餐配置
export const RECHARGE_PACKAGES = [
  { price: 19, credits: 2000, bonus: null, tag: null },
  { price: 49, credits: 5000, bonus: null, tag: null },
  { price: 99, credits: 20000, bonus: null, tag: '限时首充双倍' },
  { price: 199, credits: 26000, bonus: null, tag: '限时首充7.5折' },
];

// 积分兑换比例：1元 = 100积分
export const CREDITS_PER_YUAN = 100;
export const MIN_CUSTOM_RECHARGE_AMOUNT = 200;
