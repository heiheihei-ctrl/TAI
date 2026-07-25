import DashboardDistributionChart from "@/components/admin/DashboardDistributionChart";
import type { UserProfileDemographics } from "@/services/adminApi";

type Props = {
  data: UserProfileDemographics;
};

export default function UserProfileDemographicsPanel({ data }: Props) {
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold text-gray-800">用户画像统计</h3>
          <p className="mt-1 text-xs text-gray-500">
            基于用户完善资料字段汇总，统计口径为全部注册用户
          </p>
        </div>
        <div className="rounded-lg border bg-white px-4 py-3 text-sm shadow-sm">
          <span className="text-gray-500">已完善资料：</span>
          <span className="font-semibold text-gray-900">{data.profiledUsers}</span>
          <span className="text-gray-500"> / {data.totalUsers}</span>
          <span className="ml-2 text-blue-600">({data.completionRate}%)</span>
        </div>
      </div>

      <div className="flex flex-col lg:flex-row" style={{ gap: 20 }}>
        <DashboardDistributionChart
          className="min-w-0 flex-1"
          title="性别分布"
          subtitle="饼图展示各性别占比"
          data={data.gender}
          chartType="pie"
          height={300}
        />
        <DashboardDistributionChart
          className="min-w-0 flex-1"
          title="年龄分布"
          subtitle="18岁以下、18-30岁、30-50岁、50岁以上"
          data={data.age}
          chartType="pie"
          height={300}
        />
        <DashboardDistributionChart
          className="min-w-0 flex-1"
          title="渠道来源分布"
          subtitle="用户填写来源渠道奖励后的占比"
          data={data.sourceChannel ?? []}
          chartType="pie"
          height={300}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <DashboardDistributionChart
          title="职业分布"
          subtitle="展示 Top 12 职业，其余合并为「其他」"
          data={data.occupation}
          chartType="bar"
          height={320}
        />
        <DashboardDistributionChart
          title="省份分布"
          subtitle="按所在地区省份汇总"
          data={data.regionByProvince}
          chartType="bar"
          height={320}
        />
        <div className="xl:col-span-2">
          <DashboardDistributionChart
            title="城市分布"
            subtitle="展示 Top 12 城市（省 / 市），其余合并为「其他」"
            data={data.regionByCity}
            chartType="bar"
            height={340}
          />
        </div>
      </div>
    </div>
  );
}
