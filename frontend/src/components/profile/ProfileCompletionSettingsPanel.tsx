import React from "react";
import { Loader2 } from "lucide-react";
import {
  fetchExtendedProfile,
  updateExtendedProfile,
  type ExtendedProfile,
  type UpdateExtendedProfilePayload,
} from "@/services/extendedProfileApi";
import BirthdayPicker from "@/components/profile/BirthdayPicker";
import RegionPicker from "@/components/profile/RegionPicker";
import ProfileRewardCredits from "@/components/profile/ProfileRewardCredits";
import { isCompleteRegion } from "@/data/chinaRegions";

type Props = {
  onProfileUpdated?: (profile: ExtendedProfile) => void;
};

const inputClassName =
  "w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none transition-colors focus:border-violet-400 focus:ring-2 focus:ring-violet-100";

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function ProfileCompletionSettingsPanel({ onProfileUpdated }: Props) {
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [profile, setProfile] = React.useState<ExtendedProfile | null>(null);
  const [realName, setRealName] = React.useState("");
  const [nickname, setNickname] = React.useState("");
  const [gender, setGender] = React.useState<"male" | "female" | "other" | "">("");
  const [birthday, setBirthday] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [occupation, setOccupation] = React.useState("");
  const [company, setCompany] = React.useState("");
  const [region, setRegion] = React.useState("");
  const [feedback, setFeedback] = React.useState<React.ReactNode>(null);
  const [error, setError] = React.useState<string | null>(null);

  const applyProfile = React.useCallback((next: ExtendedProfile) => {
    setProfile(next);
    setRealName(next.realName || "");
    setNickname(next.nickname || "");
    setGender((next.gender as "male" | "female" | "other" | "") || "");
    setBirthday(next.birthday || "");
    setEmail(next.email || "");
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

    if (!realName.trim()) {
      setError("请填写姓名");
      return;
    }
    if (!nickname.trim()) {
      setError("请填写昵称");
      return;
    }
    if (!gender) {
      setError("请选择性别");
      return;
    }
    if (!birthday) {
      setError("请选择生日");
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
    if (!email.trim() || !emailPattern.test(email.trim())) {
      setError("请填写有效邮箱");
      return;
    }
    if (!isCompleteRegion(region)) {
      setError("请选择完整的省 / 市 / 区县");
      return;
    }

    const payload: UpdateExtendedProfilePayload = {
      realName: realName.trim(),
      nickname: nickname.trim(),
      gender,
      birthday,
      email: email.trim().toLowerCase(),
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
        setFeedback(
          <>
            资料已保存，<ProfileRewardCredits credits={result.rewardCredits} /> 积分已到账！
          </>,
        );
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

  const rewardCredits = profile?.rewardCredits || 100;
  const canEarnReward = !profile?.rewardClaimed;

  return (
    <div className="pb-6 space-y-5">
      <div className="mt-4">
        <h2 className="text-xl font-semibold text-slate-900">个人信息</h2>
        <p className="mt-2 text-sm leading-relaxed text-slate-500">
          {canEarnReward ? (
            <>
              填写以下信息并保存，首次完成可奖励{" "}
              <ProfileRewardCredits credits={rewardCredits} /> 积分。
            </>
          ) : (
            "您已领取奖励，仍可在此更新个人信息。"
          )}
        </p>
      </div>

      <form onSubmit={(event) => void handleSubmit(event)} className="space-y-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <label className="block space-y-1.5">
            <span className="text-sm font-medium text-slate-700">姓名</span>
            <input
              className={inputClassName}
              value={realName}
              onChange={(event) => setRealName(event.target.value)}
              placeholder="请输入您的姓名"
              maxLength={50}
            />
          </label>

          <label className="block space-y-1.5">
            <span className="text-sm font-medium text-slate-700">昵称</span>
            <input
              className={inputClassName}
              value={nickname}
              onChange={(event) => setNickname(event.target.value)}
              placeholder="请输入您的昵称"
              maxLength={50}
            />
          </label>
        </div>

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
            <option value="other">未知</option>
          </select>
        </label>

        <div className="space-y-1.5">
          <span className="text-sm font-medium text-slate-700">生日</span>
          <BirthdayPicker value={birthday} onChange={setBirthday} />
        </div>

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
          <span className="text-sm font-medium text-slate-700">邮箱</span>
          <input
            className={inputClassName}
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="请输入邮箱地址"
            maxLength={120}
          />
        </label>

        <div className="space-y-1.5">
          <span className="text-sm font-medium text-slate-700">所在地区（省 / 市 / 区县）</span>
          <RegionPicker value={region} onChange={setRegion} />
        </div>

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
