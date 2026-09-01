import React, { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  fetchAdminPresetPrompts,
  saveAdminPresetPrompts,
  type ChatPresetPromptItem,
  type ChatPresetPromptsData,
} from '@/services/presetPromptService';

const createEmptyItem = (category = ''): ChatPresetPromptItem => ({
  id: `tmp_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
  category,
  title: '',
  content: '',
  sortOrder: 0,
  isActive: true,
});

const PresetPromptsTab: React.FC = () => {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [categories, setCategories] = useState<string[]>([]);
  const [items, setItems] = useState<ChatPresetPromptItem[]>([]);
  const [newCategory, setNewCategory] = useState('');

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchAdminPresetPrompts();
      setCategories(data.categories || []);
      setItems(
        (data.items || []).map((item, index) => ({
          ...item,
          sortOrder: typeof item.sortOrder === 'number' ? item.sortOrder : index,
          isActive: item.isActive !== false,
        }))
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载失败');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const payload: ChatPresetPromptsData = {
        categories: categories.map((c) => c.trim()).filter(Boolean),
        items: items
          .map((item, index) => ({
            ...item,
            title: item.title.trim(),
            content: (item.content || item.title).trim(),
            category: item.category.trim(),
            sortOrder: index,
          }))
          .filter((item) => item.title),
      };
      const saved = await saveAdminPresetPrompts(payload);
      setCategories(saved.categories || []);
      setItems(saved.items || []);
      setMessage('已保存');
    } catch (err) {
      setError(err instanceof Error ? err.message : '保存失败');
    } finally {
      setSaving(false);
    }
  };

  const handleAddCategory = () => {
    const value = newCategory.trim();
    if (!value) return;
    if (categories.includes(value)) {
      setError('分类已存在');
      return;
    }
    setCategories((prev) => [...prev, value]);
    setNewCategory('');
    setError(null);
  };

  return (
    <div className='space-y-4 rounded-lg border bg-white p-4 shadow-sm'>
      <div className='flex flex-wrap items-center justify-between gap-3'>
        <div>
          <h3 className='text-base font-semibold text-gray-900'>预设提示词</h3>
          <p className='mt-1 text-sm text-gray-500'>
            管理 AI 对话框书本按钮单击后展示的分类与提示词。点击提示词会填充到输入框。
          </p>
        </div>
        <div className='flex items-center gap-2'>
          <Button variant='outline' onClick={() => void loadData()} disabled={loading || saving}>
            刷新
          </Button>
          <Button onClick={() => void handleSave()} disabled={loading || saving}>
            {saving ? '保存中...' : '保存'}
          </Button>
        </div>
      </div>

      {error && (
        <div className='rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700'>
          {error}
        </div>
      )}
      {message && (
        <div className='rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700'>
          {message}
        </div>
      )}

      {loading ? (
        <div className='py-10 text-center text-sm text-gray-500'>加载中...</div>
      ) : (
        <>
          <div className='rounded-lg border p-3'>
            <div className='mb-3 text-sm font-medium text-gray-800'>分类</div>
            <div className='mb-3 flex flex-wrap gap-2'>
              {categories.map((category) => (
                <div
                  key={category}
                  className='inline-flex items-center gap-2 rounded-full border bg-gray-50 px-3 py-1 text-sm'
                >
                  <span>{category}</span>
                  <button
                    type='button'
                    className='text-gray-400 hover:text-red-500'
                    onClick={() =>
                      setCategories((prev) => prev.filter((item) => item !== category))
                    }
                  >
                    ×
                  </button>
                </div>
              ))}
              {categories.length === 0 && (
                <span className='text-sm text-gray-400'>暂无分类</span>
              )}
            </div>
            <div className='flex flex-wrap gap-2'>
              <Input
                value={newCategory}
                onChange={(e) => setNewCategory(e.target.value)}
                placeholder='新增分类名称'
                className='max-w-xs'
              />
              <Button type='button' variant='outline' onClick={handleAddCategory}>
                添加分类
              </Button>
            </div>
          </div>

          <div className='rounded-lg border p-3'>
            <div className='mb-3 flex items-center justify-between gap-2'>
              <div className='text-sm font-medium text-gray-800'>提示词条目</div>
              <Button
                type='button'
                variant='outline'
                onClick={() =>
                  setItems((prev) => [
                    ...prev,
                    createEmptyItem(categories[0] || ''),
                  ])
                }
              >
                新增提示词
              </Button>
            </div>

            <div className='space-y-3'>
              {items.map((item, index) => (
                <div
                  key={item.id}
                  className='grid gap-2 rounded-lg border bg-gray-50/60 p-3 md:grid-cols-[160px_1fr_1.2fr_auto_auto]'
                >
                  <select
                    value={item.category}
                    onChange={(e) =>
                      setItems((prev) =>
                        prev.map((row, i) =>
                          i === index ? { ...row, category: e.target.value } : row
                        )
                      )
                    }
                    className='h-9 rounded-md border border-gray-200 bg-white px-2 text-sm'
                  >
                    <option value=''>未分类</option>
                    {categories.map((category) => (
                      <option key={category} value={category}>
                        {category}
                      </option>
                    ))}
                  </select>
                  <Input
                    value={item.title}
                    onChange={(e) =>
                      setItems((prev) =>
                        prev.map((row, i) =>
                          i === index ? { ...row, title: e.target.value } : row
                        )
                      )
                    }
                    placeholder='展示标题'
                  />
                  <Input
                    value={item.content}
                    onChange={(e) =>
                      setItems((prev) =>
                        prev.map((row, i) =>
                          i === index ? { ...row, content: e.target.value } : row
                        )
                      )
                    }
                    placeholder='填充到输入框的内容（可留空=用标题）'
                  />
                  <label className='inline-flex items-center gap-2 text-sm text-gray-600'>
                    <input
                      type='checkbox'
                      checked={item.isActive !== false}
                      onChange={(e) =>
                        setItems((prev) =>
                          prev.map((row, i) =>
                            i === index ? { ...row, isActive: e.target.checked } : row
                          )
                        )
                      }
                    />
                    启用
                  </label>
                  <Button
                    type='button'
                    variant='outline'
                    onClick={() =>
                      setItems((prev) => prev.filter((_, i) => i !== index))
                    }
                  >
                    删除
                  </Button>
                </div>
              ))}
              {items.length === 0 && (
                <div className='py-8 text-center text-sm text-gray-400'>
                  暂无提示词，点击「新增提示词」开始添加
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default PresetPromptsTab;
