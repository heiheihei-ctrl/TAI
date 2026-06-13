import { createPortal } from "react-dom";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { useTranslation } from "react-i18next";

type AgreementConsentModalProps = {
  isOpen: boolean;
  onAgree: () => void;
  onDisagree: () => void;
};

export default function AgreementConsentModal({
  isOpen,
  onAgree,
  onDisagree,
}: AgreementConsentModalProps) {
  const { t } = useTranslation();

  if (!isOpen) return null;

  const agreementLinks = (
    <>
      <Link
        to="/legal/terms"
        className="text-blue-500 underline hover:text-blue-600"
        target="_blank"
        onClick={(e) => e.stopPropagation()}
      >
        {t("auth.agreements.terms")}
      </Link>
      {t("auth.agreements.comma")}
      <Link
        to="/legal/privacy"
        className="text-blue-500 underline hover:text-blue-600"
        target="_blank"
        onClick={(e) => e.stopPropagation()}
      >
        {t("auth.agreements.privacy")}
      </Link>
      {t("auth.agreements.and")}
      <Link
        to="/legal/community"
        className="text-blue-500 underline hover:text-blue-600"
        target="_blank"
        onClick={(e) => e.stopPropagation()}
      >
        {t("auth.agreements.community")}
      </Link>
    </>
  );

  const modalContent = (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onDisagree}
        aria-hidden
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="agreement-consent-title"
        className="relative w-full max-w-md rounded-2xl bg-white px-6 py-8 shadow-2xl"
      >
        <p
          id="agreement-consent-title"
          className="text-[15px] leading-7 text-slate-700"
        >
          {t("auth.agreements.consentModalLead")}
          {agreementLinks}
          {t("auth.agreements.consentModalTail")}
        </p>
        <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:justify-center">
          <Button
            type="button"
            className="h-11 flex-1 rounded-xl bg-blue-500 text-white hover:bg-blue-600 sm:min-w-[140px] sm:flex-none"
            onClick={onAgree}
          >
            {t("auth.agreements.consentModalAgree")}
          </Button>
          <Button
            type="button"
            variant="outline"
            className="h-11 flex-1 rounded-xl border-slate-200 text-slate-600 hover:bg-slate-50 sm:min-w-[100px] sm:flex-none"
            onClick={onDisagree}
          >
            {t("auth.agreements.consentModalDisagree")}
          </Button>
        </div>
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
}
