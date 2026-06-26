import React from "react";
import { Loader2 } from "lucide-react";
import {
  fetchExtendedProfile,
  updateExtendedProfile,
  type ExtendedProfile,
  type UpdateExtendedProfilePayload,
} from "@/services/extendedProfileApi";

type Props = {
  onProfileUpdated?: (profile: ExtendedProfile) => void;
};

const inputClassName =
  "w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none transition-colors focus:border-violet-400 focus:ring-2 focus:ring-violet-100";

export default function ProfileCompletionSettingsPanel({ onProfileUpdated }: Props) {
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [profile, setProfile] = React.useState<ExtendedProfile | null>(null);
  const [realName, setRealName] = React.useState("");
  const [gender, setGender] = React.useState<"male" | "female" | "other" | "">("");
  const [age, setAge] = React.useState("");
  const [occupation, setOccupation] = React.useState("");
  const [company, setCompany] = React.useState("");
  const [region, setRegion] = React.useState("");
  const [feedback, setFeedback] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  const applyProfile = React.useCallback((next: ExtendedProfile) => {
    setProfile(next);
    setRealName(next.realName || "");
    setGender((next.gender as "male" | "female" | "other" | "") || "");
    setAge(next.age != null ? String(next.age) : "");
    setOccupation(next.occupation || "");
    setCompany(next.company || "");
    setRegion(next.region || "");
  }, []);

  React.useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void fetchExtendedProfile()
      .then((data) => {
        if (cancelled) return;
        applyProfile(data);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "加载资料失败");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [applyProfile]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setFeedback(null);

    const parsedAge = Number.parseInt(age, 10);
    if (!realName.trim()) {
      setError("请填写真实姓名");
      return;
    }
    if (!gender) {
      setError("请选择性别");
      return;
    }
    if (!Number.isFinite(parsedAge) || parsedAge < 1 || parsedAge > 120) {
      setError("请填写有效年龄（1-120）");
      return;
    }
    if (!occupation.trim()) {
      setError("请填写职业");
      return;
    }
    if (!company.trim()) {
      setError("请填写公司");
      return;
    }
    if (!region.trim()) {
      setError("请填写所在地区");
      return;
    }

    const payload: UpdateExtendedProfilePayload = {
      realName: realName.trim(),
      gender,
      age: parsedAge,
      occupation: occupation.trim(),
      company: company.trim(),
      region: region.trim(),
    };

    setSaving(true);
    try {
      const result = await updateExtendedProfile(payload);
      applyProfile(result.profile);
      onProfileUpdated?.(result.profile);
      if (result.rewardGranted) {
        setFeedback(`资料已保存，${result.rewardCredits} 积分已到账！`);
        window.dispatchEvent(new CustomEvent("refresh-credits"));
      } else {
        setFeedback("资料已保存");
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "保存失败");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16 text-sm text-slate-500">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        加载中...
      </div>
    );
  }

  const rewardCredits = profile?.rewardCredits || 50;
  const canEarnReward = !profile?.rewardClaimed;

  return (
    <div className="pb-6 space-y-5">
      <div className="mt-4">
        <h2 className="text-xl font-semibold text-slate-900">完善资料</h2>
        <p className="mt-2 text-sm leading-relaxed text-slate-500">
          {canEarnReward
            ? `填写以下信息并保存，即可领取 ${rewardCredits} 积分奖励。`
            : "您已领取完善资料奖励，仍可在此更新个人信息。"}
        </p>
      </div>

      <form onSubmit={(event) => void handleSubmit(event)} className="space-y-4">
        <label className="block space-y-1.5">
          <span className="text-sm font-medium text-slate-700">真实姓名</span>
          <input
            className={inputClassName}
            value={realName}
            onChange={(event) => setRealName(event.target.value)}
            placeholder="请输入您的真实姓名"
            maxLength={50}
          />
        </label>

        <label className="block space-y-1.5">
          <span className="text-sm font-medium text-slate-700">性别</span>
          <select
            className={inputClassName}
            value={gender}
            onChange={(event) =>
              setGender(event.target.value as "male" | "female" | "other" | "")
            }
          >
            <option value="">请选择</option>
            <option value="male">男</option>
            <option value="female">女</option>
            <option value="other">不愿透露</option>
          </select>
        </label>

        <label className="block space-y-1.5">
          <span className="text-sm font-medium text-slate-700">年龄</span>
          <input
            className={inputClassName}
            type="number"
            min={1}
            max={120}
            value={age}
            onChange={(event) => setAge(event.target.value)}
            placeholder="请输入年龄"
          />
        </label>

        <label className="block space-y-1.5">
          <span className="text-sm font-medium text-slate-700">职业</span>
          <input
            className={inputClassName}
            value={occupation}
            onChange={(event) => setOccupation(event.target.value)}
            placeholder="例如：室内设计师、产品经理"
            maxLength={80}
          />
        </label>

        <label className="block space-y-1.5">
          <span className="text-sm font-medium text-slate-700">公司</span>
          <input
            className={inputClassName}
            value={company}
            onChange={(event) => setCompany(event.target.value)}
            placeholder="例如：某某设计有限公司"
            maxLength={120}
          />
        </label>

        <label className="block space-y-1.5">
          <span className="text-sm font-medium text-slate-700">所在地区</span>
          <input
            className={inputClassName}
            value={region}
            onChange={(event) => setRegion(event.target.value)}
            placeholder="例如：广东省深圳市"
            maxLength={120}
          />
        </label>

        {error ? <div className="text-sm text-red-500">{error}</div> : null}
        {feedback ? <div className="text-sm text-emerald-600">{feedback}</div> : null}

        <button
          type="submit"
          disabled={saving}
          className="inline-flex items-center justify-center rounded-xl bg-violet-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {saving ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              保存中...
            </>
          ) : (
            "保存资料"
          )}
        </button>
      </form>
    </div>
  );
}
