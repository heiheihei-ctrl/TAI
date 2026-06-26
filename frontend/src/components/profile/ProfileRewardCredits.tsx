type Props = {
  credits?: number;
  className?: string;
};

/** 积分数字高亮：加粗并略放大 */
export default function ProfileRewardCredits({ credits = 100, className = "" }: Props) {
  return (
    <span
      className={`inline-block align-baseline text-base font-bold text-violet-600 sm:text-lg mx-1 ${className}`.trim()}
    >
      {credits}
    </span>
  );
}
