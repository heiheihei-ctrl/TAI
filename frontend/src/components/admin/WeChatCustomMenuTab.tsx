import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import {
  deleteRemoteWechatCustomMenu,
  getWechatCustomMenu,
  publishWechatCustomMenu,
  saveWechatCustomMenu,
  type WechatCustomMenuDraft,
  type WechatMenuLeafButton,
  type WechatMenuLeafType,
  type WechatMenuTopButton,
} from "@/services/adminApi";

const MAX_TOP = 3;
const MAX_SUB = 5;

const MENU_TYPE_OPTIONS: Array<{ value: WechatMenuLeafType; label: string }> = [
  { value: "click", label: "点击推事件 (click)" },
  { value: "view", label: "跳转网页 (view)" },
  { value: "miniprogram", label: "跳转小程序 (miniprogram)" },
];

function createEmptyTopButton(name = "菜单"): WechatMenuTopButton {
  return {
    name,
    type: "click",
    key: `MENU_${Date.now()}`,
  };
}

function createEmptySubButton(name = "子菜单"): WechatMenuLeafButton {
  return {
    name,
    type: "click",
    key: `SUB_${Date.now()}`,
  };
}

function cloneDraft(draft: WechatCustomMenuDraft): WechatCustomMenuDraft {
  return JSON.parse(JSON.stringify(draft)) as WechatCustomMenuDraft;
}

export default function WeChatCustomMenuTab() {
  const [draft, setDraft] = useState<WechatCustomMenuDraft>({ button: [] });
  const [remoteMenu, setRemoteMenu] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [selectedTopIndex, setSelectedTopIndex] = useState(0);
  const [selectedSubIndex, setSelectedSubIndex] = useState<number | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getWechatCustomMenu();
      const nextDraft =
        data.draft?.button?.length > 0
          ? data.draft
          : { button: [createEmptyTopButton("菜单名称")] };
      setDraft(nextDraft);
      setRemoteMenu(data.remoteMenu);
      setSelectedTopIndex(0);
      setSelectedSubIndex(null);
    } catch (error: any) {
      alert(error.message || "加载自定义菜单失败");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const topButtons = draft.button;
  const currentTop = topButtons[selectedTopIndex];
  const subButtons = currentTop?.sub_button || [];
  const hasSubMenu = subButtons.length > 0;
  const editingSub =
    selectedSubIndex !== null ? subButtons[selectedSubIndex] : null;

  const previewTitle = useMemo(() => {
    if (editingSub) return editingSub.name || "子菜单";
    return currentTop?.name || "菜单名称";
  }, [currentTop?.name, editingSub]);

  const updateDraft = (updater: (prev: WechatCustomMenuDraft) => WechatCustomMenuDraft) => {
    setDraft((prev) => updater(cloneDraft(prev)));
  };

  const handleAddTopButton = () => {
    if (topButtons.length >= MAX_TOP) return;
    updateDraft((prev) => ({
      button: [...prev.button, createEmptyTopButton(`菜单${prev.button.length + 1}`)],
    }));
    setSelectedTopIndex(topButtons.length);
    setSelectedSubIndex(null);
  };

  const handleAddSubButton = () => {
    if (!currentTop || subButtons.length >= MAX_SUB) return;
    updateDraft((prev) => {
      const next = cloneDraft(prev);
      const top = next.button[selectedTopIndex];
      const list = Array.isArray(top.sub_button) ? [...top.sub_button] : [];
      list.push(createEmptySubButton(`子菜单${list.length + 1}`));
      top.sub_button = list;
      delete top.type;
      delete top.key;
      delete top.url;
      delete top.appid;
      delete top.pagepath;
      return next;
    });
    setSelectedSubIndex(subButtons.length);
  };

  const handleDeleteCurrent = () => {
    if (selectedSubIndex !== null) {
      updateDraft((prev) => {
        const next = cloneDraft(prev);
        const top = next.button[selectedTopIndex];
        top.sub_button = (top.sub_button || []).filter((_, i) => i !== selectedSubIndex);
        if ((top.sub_button || []).length === 0) {
          top.type = top.type || "click";
          top.key = top.key || `MENU_${Date.now()}`;
        }
        return next;
      });
      setSelectedSubIndex(null);
      return;
    }

    updateDraft((prev) => ({
      button: prev.button.filter((_, i) => i !== selectedTopIndex),
    }));
    setSelectedTopIndex(Math.max(0, selectedTopIndex - 1));
    setSelectedSubIndex(null);
  };

  const patchCurrentTop = (patch: Partial<WechatMenuTopButton>) => {
    updateDraft((prev) => {
      const next = cloneDraft(prev);
      next.button[selectedTopIndex] = {
        ...next.button[selectedTopIndex],
        ...patch,
      };
      return next;
    });
  };

  const patchCurrentSub = (patch: Partial<WechatMenuLeafButton>) => {
    if (selectedSubIndex === null) return;
    updateDraft((prev) => {
      const next = cloneDraft(prev);
      const top = next.button[selectedTopIndex];
      const list = [...(top.sub_button || [])];
      list[selectedSubIndex] = { ...list[selectedSubIndex], ...patch };
      top.sub_button = list;
      return next;
    });
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const result = await saveWechatCustomMenu(draft);
      setDraft(result.draft);
      alert("草稿保存成功");
    } catch (error: any) {
      alert(error.message || "保存失败");
    } finally {
      setSaving(false);
    }
  };

  const handlePublish = async () => {
    setPublishing(true);
    try {
      await saveWechatCustomMenu(draft);
      const result = await publishWechatCustomMenu();
      setDraft(result.draft);
      alert("菜单已发布到微信公众号");
      void loadData();
    } catch (error: any) {
      alert(error.message || "发布失败");
    } finally {
      setPublishing(false);
    }
  };

  const handlePreviewRemote = async () => {
    try {
      const data = await getWechatCustomMenu();
      setRemoteMenu(data.remoteMenu);
      alert(data.remoteMenu ? "已刷新线上菜单信息" : "当前线上暂无自定义菜单");
    } catch (error: any) {
      alert(error.message || "预览失败");
    }
  };

  const handleDeleteRemote = async () => {
    if (!window.confirm("确定删除微信公众号线上自定义菜单？")) return;
    try {
      await deleteRemoteWechatCustomMenu();
      alert("线上菜单已删除");
      void loadData();
    } catch (error: any) {
      alert(error.message || "删除失败");
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 py-12 text-muted-foreground">
        <LoadingSpinner size="sm" />
        <span className="text-sm">加载中...</span>
      </div>
    );
  }

  if (!currentTop) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>自定义菜单</CardTitle>
          <CardDescription>请先添加一级菜单</CardDescription>
        </CardHeader>
        <CardContent>
          <Button onClick={handleAddTopButton}>添加一级菜单</Button>
        </CardContent>
      </Card>
    );
  }

  const renderLeafFields = (
    value: WechatMenuLeafButton | WechatMenuTopButton,
    onChange: (patch: Partial<WechatMenuLeafButton>) => void,
    nameLimit: number,
  ) => (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label>名称</Label>
        <Input
          value={value.name}
          maxLength={nameLimit}
          onChange={(e) => onChange({ name: e.target.value })}
        />
        <p className="text-xs text-muted-foreground">
          仅支持中英文和数字，字数不超过 {nameLimit} 个汉字。
        </p>
      </div>

      <div className="space-y-2">
        <Label>菜单内容</Label>
        <Select
          value={value.type || "click"}
          onValueChange={(next) => onChange({ type: next as WechatMenuLeafType })}
        >
          <SelectTrigger>
            <SelectValue placeholder="选择菜单类型" />
          </SelectTrigger>
          <SelectContent>
            {MENU_TYPE_OPTIONS.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {value.type === "click" ? (
        <div className="space-y-2">
          <Label>Key</Label>
          <Input
            value={value.key || ""}
            onChange={(e) => onChange({ key: e.target.value })}
            placeholder="例如：V1001_TODAY_MUSIC"
          />
        </div>
      ) : null}

      {value.type === "view" || value.type === "miniprogram" ? (
        <div className="space-y-2">
          <Label>{value.type === "miniprogram" ? "备用网页链接" : "网页链接"}</Label>
          <Input
            value={value.url || ""}
            onChange={(e) => onChange({ url: e.target.value })}
            placeholder="https://"
          />
        </div>
      ) : null}

      {value.type === "miniprogram" ? (
        <>
          <div className="space-y-2">
            <Label>小程序 AppID</Label>
            <Input
              value={value.appid || ""}
              onChange={(e) => onChange({ appid: e.target.value })}
            />
          </div>
          <div className="space-y-2">
            <Label>小程序页面路径</Label>
            <Input
              value={value.pagepath || ""}
              onChange={(e) => onChange({ pagepath: e.target.value })}
              placeholder="pages/index/index"
            />
          </div>
        </>
      ) : null}
    </div>
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">自定义菜单</CardTitle>
        <CardDescription>
          参照微信公众号自定义菜单规范配置，最多 3 个一级菜单，每个一级菜单最多 5 个子菜单。
          发布后将调用微信
          <a
            className="mx-1 text-blue-600 hover:underline"
            href="https://developers.weixin.qq.com/doc/service/api/custommenu/api_createcustommenu.html"
            target="_blank"
            rel="noreferrer"
          >
            创建自定义菜单 API
          </a>
          同步到服务号。
        </CardDescription>
      </CardHeader>

      <CardContent>
        <div className="grid gap-6 lg:grid-cols-[320px_minmax(0,1fr)]">
          <div className="mx-auto w-full max-w-[320px]">
            <div className="overflow-hidden rounded-[28px] border border-gray-200 bg-[#ededed] shadow-sm">
              <div className="flex items-center justify-between bg-[#ededed] px-4 py-3 text-sm text-gray-700">
                <span>‹</span>
                <span className="font-medium">公众号</span>
                <span>•••</span>
              </div>
              <div className="relative h-[420px] bg-[#f7f7f7]">
                <div className="flex h-full items-center justify-center px-6 text-center text-sm text-gray-400">
                  菜单预览：{previewTitle}
                </div>

                {hasSubMenu ? (
                  <div className="absolute bottom-[52px] left-1/2 w-[220px] -translate-x-1/2 overflow-hidden rounded-md border border-gray-200 bg-white shadow">
                    {subButtons.map((sub, index) => (
                      <button
                        key={`${sub.name}-${index}`}
                        type="button"
                        onClick={() => setSelectedSubIndex(index)}
                        className={`block w-full border-b px-4 py-3 text-left text-sm last:border-b-0 ${
                          selectedSubIndex === index
                            ? "bg-green-50 text-green-700"
                            : "text-gray-700 hover:bg-gray-50"
                        }`}
                      >
                        {sub.name || "子菜单"}
                      </button>
                    ))}
                    {subButtons.length < MAX_SUB ? (
                      <button
                        type="button"
                        onClick={handleAddSubButton}
                        className="block w-full px-4 py-3 text-left text-sm text-gray-500 hover:bg-gray-50"
                      >
                        + 添加
                      </button>
                    ) : null}
                  </div>
                ) : null}

                <div className="absolute bottom-0 left-0 right-0 flex border-t border-gray-200 bg-[#fafafa]">
                  <div className="flex w-[52px] items-center justify-center border-r border-gray-200 text-lg text-gray-500">
                    ☰
                  </div>
                  {topButtons.map((item, index) => (
                    <button
                      key={`${item.name}-${index}`}
                      type="button"
                      onClick={() => {
                        setSelectedTopIndex(index);
                        setSelectedSubIndex(null);
                      }}
                      className={`flex-1 border-r border-gray-200 px-2 py-3 text-sm last:border-r-0 ${
                        selectedTopIndex === index && selectedSubIndex === null
                          ? "border-t-2 border-t-green-500 bg-white font-medium text-green-700"
                          : "text-gray-700 hover:bg-white"
                      }`}
                    >
                      {item.name || "菜单"}
                    </button>
                  ))}
                  {topButtons.length < MAX_TOP ? (
                    <button
                      type="button"
                      onClick={handleAddTopButton}
                      className="flex-1 px-2 py-3 text-sm text-gray-500 hover:bg-white"
                    >
                      +
                    </button>
                  ) : null}
                </div>
              </div>
            </div>
          </div>

          <div className="rounded-lg border bg-white p-5 shadow-sm">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h3 className="text-base font-semibold">菜单信息</h3>
                <p className="text-xs text-muted-foreground">
                  {hasSubMenu && selectedSubIndex === null
                    ? "已添加子菜单，仅可设置菜单名称"
                    : editingSub
                      ? "正在编辑子菜单"
                      : "正在编辑一级菜单"}
                </p>
              </div>
              {hasSubMenu && selectedSubIndex === null ? (
                <Button variant="outline" size="sm" onClick={handleAddSubButton}>
                  添加子菜单
                </Button>
              ) : null}
            </div>

            {hasSubMenu && selectedSubIndex === null ? (
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label>名称</Label>
                  <Input
                    value={currentTop.name}
                    maxLength={4}
                    onChange={(e) => patchCurrentTop({ name: e.target.value })}
                  />
                  <p className="text-xs text-muted-foreground">
                    仅支持中英文和数字，字数不超过 4 个汉字。
                  </p>
                </div>
              </div>
            ) : editingSub ? (
              renderLeafFields(editingSub, patchCurrentSub, 8)
            ) : (
              renderLeafFields(currentTop, patchCurrentTop, 4)
            )}

            <button
              type="button"
              className="mt-6 text-sm text-blue-600 hover:underline"
              onClick={handleDeleteCurrent}
            >
              删除菜单
            </button>
          </div>
        </div>

        {remoteMenu ? (
          <div className="mt-6 rounded-lg border bg-muted/20 p-4">
            <div className="mb-2 text-sm font-medium">线上菜单快照</div>
            <pre className="max-h-48 overflow-auto whitespace-pre-wrap break-all text-xs text-muted-foreground">
              {JSON.stringify(remoteMenu, null, 2)}
            </pre>
          </div>
        ) : null}
      </CardContent>

      <div className="flex flex-wrap items-center justify-end gap-3 border-t px-6 py-4">
        <Button variant="outline" onClick={handlePreviewRemote}>
          预览
        </Button>
        <Button variant="outline" onClick={handleDeleteRemote}>
          删除线上菜单
        </Button>
        <Button variant="outline" onClick={handleSave} disabled={saving}>
          {saving ? "保存中..." : "保存草稿"}
        </Button>
        <Button onClick={handlePublish} disabled={publishing}>
          {publishing ? "发布中..." : "保存并发布"}
        </Button>
      </div>
    </Card>
  );
}
