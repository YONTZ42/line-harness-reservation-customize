import { useMemo, useState } from 'react'
import { LineMessageBubble } from '@/components/line-message-bubble'
import { fetchApi } from '@/lib/api'
import type { ConsoleForm, ConsoleTag, FormDraft } from '../types'
import { formatDateTime } from '../utils'

type FieldType = 'text' | 'email' | 'tel' | 'number' | 'textarea' | 'select' | 'radio' | 'checkbox' | 'date' | 'image'

type ManagedField = {
  name: string
  label: string
  type: FieldType | string
  required?: boolean
  options?: string[]
  imageUrl?: string
}

type FormWithFields = ConsoleForm & {
  description?: string | null
  fields?: ManagedField[] | string
  isActive?: boolean
  saveToMetadata?: boolean
  onSubmitMessageType?: 'text' | 'flex' | null
  onSubmitMessageContent?: string | null
}

type FormSubmission = {
  id: string
  formId: string
  friendId: string | null
  friendName?: string | null
  data: Record<string, unknown> | string
  createdAt: string
}

type ChatDetail = {
  id: string
  friendId: string
  friendName: string
  friendPictureUrl?: string | null
  messages?: Array<{
    id: string
    content: string
    messageType?: string
    senderType?: string
    direction?: 'incoming' | 'outgoing'
    createdAt: string
  }>
}

type ReplyMode = 'none' | 'text' | 'flex'

export function FormsTab({
  forms,
  tags,
  draft,
  setDraft,
  creating,
  onCreateForm,
  onFormsChanged,
}: {
  forms: ConsoleForm[]
  tags: ConsoleTag[]
  draft: FormDraft
  setDraft: (draft: FormDraft) => void
  creating: boolean
  onCreateForm: () => void
  onFormsChanged: () => void
}) {
  const [selectedForm, setSelectedForm] = useState<FormWithFields | null>(null)
  const [submissions, setSubmissions] = useState<FormSubmission[]>([])
  const [loadingSubmissions, setLoadingSubmissions] = useState(false)
  const [editingFormId, setEditingFormId] = useState<string | null>(null)
  const [editorOpen, setEditorOpen] = useState(false)
  const [editorLoading, setEditorLoading] = useState(false)
  const [editorSaving, setEditorSaving] = useState(false)
  const [editorName, setEditorName] = useState('')
  const [editorDescription, setEditorDescription] = useState('')
  const [editorFields, setEditorFields] = useState<ManagedField[]>([emptyField(1)])
  const [editorActive, setEditorActive] = useState(true)
  const [editorSaveToMetadata, setEditorSaveToMetadata] = useState(true)
  const [replyForm, setReplyForm] = useState<FormWithFields | null>(null)
  const [replyLoading, setReplyLoading] = useState(false)
  const [replySaving, setReplySaving] = useState(false)
  const [replyMode, setReplyMode] = useState<ReplyMode>('none')
  const [replyContent, setReplyContent] = useState('')
  const [submissionView, setSubmissionView] = useState<'list' | 'chat'>('list')
  const [chatLoading, setChatLoading] = useState(false)
  const [chatDetail, setChatDetail] = useState<ChatDetail | null>(null)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  const normalizedForms = forms as FormWithFields[]
  const totalSubmissions = normalizedForms.reduce((sum, form) => sum + (form.submitCount || 0), 0)

  async function openSubmissions(form: FormWithFields) {
    setSelectedForm(form)
    setLoadingSubmissions(true)
    setError('')
    try {
      const res = await fetchApi<{ success: boolean; data: FormSubmission[]; error?: string }>(`/api/forms/${encodeURIComponent(form.id)}/submissions`)
      if (!res.success) throw new Error(res.error || '回答を取得できませんでした。')
      setSubmissions(res.data)
    } catch (err) {
      setError(err instanceof Error ? err.message : '回答を取得できませんでした。')
    } finally {
      setLoadingSubmissions(false)
    }
  }

  function openNewEditor() {
    setEditingFormId(null)
    setEditorName('')
    setEditorDescription('')
    setEditorFields([emptyField(1)])
    setEditorActive(true)
    setEditorSaveToMetadata(true)
    setNotice('')
    setError('')
    setEditorOpen(true)
  }

  async function openEditor(form: FormWithFields) {
    setEditorOpen(true)
    setEditorLoading(true)
    setNotice('')
    setError('')
    try {
      const res = await fetchApi<{ success: boolean; data: FormWithFields; error?: string }>(`/api/forms/${encodeURIComponent(form.id)}`)
      if (!res.success) throw new Error(res.error || 'フォーム詳細を取得できませんでした。')
      const fields = normalizeFields(res.data.fields)
      setEditingFormId(res.data.id)
      setEditorName(res.data.name)
      setEditorDescription(res.data.description || '')
      setEditorFields(fields.length ? fields : [emptyField(1)])
      setEditorActive(res.data.isActive !== false)
      setEditorSaveToMetadata(res.data.saveToMetadata !== false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'フォーム詳細を取得できませんでした。')
    } finally {
      setEditorLoading(false)
    }
  }

  async function openReplySettings(form: FormWithFields) {
    setReplyForm(form)
    setReplyLoading(true)
    setReplyMode('none')
    setReplyContent('')
    setNotice('')
    setError('')
    try {
      const res = await fetchApi<{ success: boolean; data: FormWithFields; error?: string }>(`/api/forms/${encodeURIComponent(form.id)}`)
      if (!res.success) throw new Error(res.error || 'フォーム詳細を取得できませんでした。')
      setReplyForm(res.data)
      const type = res.data.onSubmitMessageType
      setReplyMode(type === 'text' || type === 'flex' ? type : 'none')
      setReplyContent(res.data.onSubmitMessageContent || '')
    } catch (err) {
      setError(err instanceof Error ? err.message : '回答後LINE返信設定を取得できませんでした。')
    } finally {
      setReplyLoading(false)
    }
  }

  async function saveReplySettings() {
    if (!replyForm) return
    if (replyMode !== 'none' && !replyContent.trim()) {
      setError('返信内容を入力してください。')
      return
    }
    setReplySaving(true)
    setError('')
    setNotice('')
    try {
      const body = replyMode === 'none'
        ? { onSubmitMessageType: null, onSubmitMessageContent: null }
        : { onSubmitMessageType: replyMode, onSubmitMessageContent: replyContent.trim() }
      const res = await fetchApi<{ success: boolean; data: FormWithFields; error?: string }>(`/api/forms/${encodeURIComponent(replyForm.id)}`, { method: 'PUT', body: JSON.stringify(body) })
      if (!res.success) throw new Error(res.error || '回答後LINE返信設定の保存に失敗しました。')
      setReplyForm(res.data)
      setNotice('回答後LINE返信設定を保存しました。')
      onFormsChanged()
    } catch (err) {
      setError(err instanceof Error ? err.message : '回答後LINE返信設定の保存に失敗しました。')
    } finally {
      setReplySaving(false)
    }
  }

  async function openSubmissionChat(friendId: string) {
    setSubmissionView('chat')
    setChatLoading(true)
    setChatDetail(null)
    setError('')
    try {
      const res = await fetchApi<{ success: boolean; data: ChatDetail; error?: string }>(`/api/chats/${encodeURIComponent(friendId)}`)
      if (!res.success) throw new Error(res.error || 'チャットを取得できませんでした。')
      setChatDetail(res.data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'チャットを取得できませんでした。')
    } finally {
      setChatLoading(false)
    }
  }

  function updateField(index: number, patch: Partial<ManagedField>) {
    setEditorFields((current) => current.map((field, i) => i === index ? normalizeField({ ...field, ...patch }, i + 1) : field))
  }

  function addField(type: FieldType = 'text') {
    setEditorFields((current) => [...current, emptyField(current.length + 1, type)])
  }

  function removeField(index: number) {
    setEditorFields((current) => current.length <= 1 ? current : current.filter((_, i) => i !== index))
  }

  async function saveEditor() {
    if (!editorName.trim()) {
      setError('フォーム名を入力してください。')
      return
    }
    const fields = editorFields.map((field, index) => normalizeField(field, index + 1)).filter((field) => field.name && field.label)
    if (fields.length === 0) {
      setError('フォーム項目を1つ以上入力してください。')
      return
    }
    setEditorSaving(true)
    setError('')
    setNotice('')
    try {
      const body = {
        name: editorName.trim(),
        description: editorDescription.trim() || null,
        fields,
        saveToMetadata: editorSaveToMetadata,
        isActive: editorActive,
      }
      const res = editingFormId
        ? await fetchApi<{ success: boolean; data: FormWithFields; error?: string }>(`/api/forms/${encodeURIComponent(editingFormId)}`, { method: 'PUT', body: JSON.stringify(body) })
        : await fetchApi<{ success: boolean; data: FormWithFields; error?: string }>('/api/forms', { method: 'POST', body: JSON.stringify(body) })
      if (!res.success) throw new Error(res.error || 'フォーム保存に失敗しました。')
      setEditingFormId(res.data.id)
      setNotice(editingFormId ? 'フォームを更新しました。' : 'フォームを作成しました。')
      onFormsChanged()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'フォーム保存に失敗しました。')
    } finally {
      setEditorSaving(false)
    }
  }

  return (
    <section className="space-y-4">
      <div className="rounded-3xl border border-gray-200 bg-white p-4 shadow-sm">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-emerald-600">Forms</p>
            <h2 className="text-xl font-black text-gray-950">フォーム</h2>
            <p className="mt-1 text-sm text-gray-500">プレビューを見て、編集・回答確認・顧客チャットへ進みます。</p>
          </div>
          <div className="flex items-center gap-2">
            <div className="rounded-2xl bg-emerald-50 px-4 py-2 text-right">
              <p className="text-xs font-bold text-emerald-700">回答を見る</p>
              <p className="text-xl font-black text-emerald-950">{totalSubmissions}件</p>
            </div>
            <button onClick={openNewEditor} className="rounded-xl bg-gray-950 px-4 py-2 text-sm font-bold text-white">
              新規作成
            </button>
          </div>
        </div>
      </div>

      {error && <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">{error}</div>}
      {notice && <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">{notice}</div>}

      <div className="rounded-3xl border border-gray-200 bg-white p-4 shadow-sm">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end">
          <label className="flex-1">
            <span className="mb-1 block text-xs font-bold text-gray-600">フォーム名</span>
            <input value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm" placeholder="例: 初回体験申込" />
          </label>
          <label className="flex-1">
            <span className="mb-1 block text-xs font-bold text-gray-600">説明</span>
            <input value={draft.description} onChange={(event) => setDraft({ ...draft, description: event.target.value })} className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm" placeholder="フォーム上部の説明" />
          </label>
          <label>
            <span className="mb-1 block text-xs font-bold text-gray-600">型</span>
            <select value={draft.preset} onChange={(event) => setDraft({ ...draft, preset: event.target.value as FormDraft['preset'] })} className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm">
              <option value="inquiry">問い合わせ</option>
              <option value="trial">体験予約</option>
              <option value="questionnaire">アンケート</option>
            </select>
          </label>
          <label>
            <span className="mb-1 block text-xs font-bold text-gray-600">送信後タグ</span>
            <select value={draft.onSubmitTagId} onChange={(event) => setDraft({ ...draft, onSubmitTagId: event.target.value })} className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm">
              <option value="">なし</option>
              {tags.map((tag) => <option key={tag.id} value={tag.id}>{tag.name}</option>)}
            </select>
          </label>
          <button onClick={onCreateForm} disabled={creating || !draft.name.trim()} className="rounded-xl bg-emerald-500 px-4 py-2 text-sm font-bold text-white disabled:opacity-50">
            {creating ? '作成中' : '簡易作成'}
          </button>
        </div>
      </div>

      {editorOpen && (
        <div className="fixed inset-0 z-50 flex items-end bg-black/45 p-0 sm:items-center sm:p-4">
        <section className="flex max-h-[94vh] w-full flex-col rounded-t-3xl bg-white shadow-2xl sm:mx-auto sm:max-w-6xl sm:rounded-3xl">
        <div className="border-b border-gray-100 p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-lg font-black text-gray-950">{editingFormId ? 'フォーム編集' : 'フォーム新規作成'}</p>
              <p className="mt-1 text-xs text-gray-500">フォーム項目を編集して、右側のプレビューで確認します。</p>
            </div>
            <button onClick={() => setEditorOpen(false)} className="rounded-full bg-gray-100 px-3 py-1.5 text-sm font-bold text-gray-700">閉じる</button>
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          {editorLoading ? (
            <p className="mt-4 rounded-2xl bg-gray-50 p-5 text-center text-sm text-gray-400">読み込み中...</p>
          ) : (
            <div className="mt-4 grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
              <div className="space-y-3">
                <input value={editorName} onChange={(event) => setEditorName(event.target.value)} className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm" placeholder="フォーム名" />
                <textarea value={editorDescription} onChange={(event) => setEditorDescription(event.target.value)} rows={2} className="w-full resize-none rounded-xl border border-gray-200 px-3 py-2 text-sm" placeholder="説明文" />
                <div className="flex flex-wrap gap-3 text-xs font-bold text-gray-600">
                  <label className="flex items-center gap-2"><input type="checkbox" checked={editorActive} onChange={(event) => setEditorActive(event.target.checked)} /> 受付中</label>
                  <label className="flex items-center gap-2"><input type="checkbox" checked={editorSaveToMetadata} onChange={(event) => setEditorSaveToMetadata(event.target.checked)} /> 回答を顧客メタデータに保存</label>
                </div>
                <div className="space-y-3">
                  {editorFields.map((field, index) => (
                    <div key={index} className="rounded-2xl border border-gray-100 bg-gray-50 p-3">
                      <div className="grid gap-2 sm:grid-cols-2">
                        <input value={field.label} onChange={(event) => updateField(index, { label: event.target.value })} className="rounded-lg border border-gray-200 px-3 py-2 text-sm" placeholder="表示名" />
                        <input value={field.name} onChange={(event) => updateField(index, { name: event.target.value })} className="rounded-lg border border-gray-200 px-3 py-2 text-sm" placeholder="保存キー" />
                        <select value={field.type} onChange={(event) => updateField(index, { type: event.target.value as FieldType })} className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm">
                          {fieldTypes.map((type) => <option key={type} value={type}>{fieldTypeLabel[type]}</option>)}
                        </select>
                        <label className="flex items-center gap-2 rounded-lg bg-white px-3 py-2 text-xs font-bold text-gray-600"><input type="checkbox" checked={Boolean(field.required)} onChange={(event) => updateField(index, { required: event.target.checked })} /> 必須</label>
                      </div>
                      {(field.type === 'select' || field.type === 'radio' || field.type === 'checkbox') && (
                        <textarea value={(field.options || []).join('\n')} onChange={(event) => updateField(index, { options: event.target.value.split('\n').map((item) => item.trim()).filter(Boolean) })} rows={3} className="mt-2 w-full resize-none rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm" placeholder="選択肢を1行ずつ入力" />
                      )}
                      {field.type === 'image' && (
                        <input value={field.imageUrl || ''} onChange={(event) => updateField(index, { imageUrl: event.target.value })} className="mt-2 w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm" placeholder="画像URL" />
                      )}
                      <button onClick={() => removeField(index)} className="mt-2 rounded-lg border border-red-100 px-3 py-1.5 text-xs font-bold text-red-600">項目削除</button>
                    </div>
                  ))}
                </div>
                <div className="flex flex-wrap gap-2">
                  <button onClick={() => addField()} className="rounded-xl border border-gray-200 px-3 py-2 text-xs font-bold text-gray-700">項目追加</button>
                  <button onClick={() => void saveEditor()} disabled={editorSaving} className="rounded-xl bg-emerald-500 px-4 py-2 text-xs font-bold text-white disabled:opacity-50">{editorSaving ? '保存中' : '保存'}</button>
                </div>
              </div>
              <div className="rounded-2xl border border-gray-100 bg-gray-50 p-4">
                <p className="mb-3 text-xs font-bold text-gray-400">プレビュー</p>
                <FormPreview name={editorName} description={editorDescription} fields={editorFields} />
              </div>
            </div>
          )}
        </div>
        </section>
        </div>
      )}

      {normalizedForms.length === 0 ? (
        <div className="rounded-3xl border border-gray-200 bg-white p-8 text-center text-sm text-gray-500 shadow-sm">
          フォームはまだありません。新規・詳細設定から作成してください。
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {normalizedForms.map((form) => (
            <FormCard
              key={form.id}
              form={form}
              onEdit={() => void openEditor(form)}
              onOpenSubmissions={() => void openSubmissions(form)}
              onOpenReplySettings={() => void openReplySettings(form)}
            />
          ))}
        </div>
      )}

      {selectedForm && (
        <SubmissionsModal
          form={selectedForm}
          submissions={submissions}
          loading={loadingSubmissions}
          view={submissionView}
          chatDetail={chatDetail}
          chatLoading={chatLoading}
          onBackToList={() => setSubmissionView('list')}
          onClose={() => { setSelectedForm(null); setSubmissionView('list'); setChatDetail(null) }}
          onOpenFriendChat={(friendId) => void openSubmissionChat(friendId)}
        />
      )}
      {replyForm && (
        <ReplySettingsModal
          form={replyForm}
          loading={replyLoading}
          saving={replySaving}
          mode={replyMode}
          content={replyContent}
          setMode={setReplyMode}
          setContent={setReplyContent}
          onSave={() => void saveReplySettings()}
          onClose={() => setReplyForm(null)}
        />
      )}
    </section>
  )
}

function FormCard({
  form,
  onEdit,
  onOpenSubmissions,
  onOpenReplySettings,
}: {
  form: FormWithFields
  onEdit: () => void
  onOpenSubmissions: () => void
  onOpenReplySettings: () => void
}) {
  const fields = useMemo(() => normalizeFields(form.fields), [form.fields])
  return (
    <article className="rounded-3xl border border-gray-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-base font-black text-gray-950">{form.name}</p>
          <p className="mt-1 text-xs text-gray-500">{form.description || '説明なし'}</p>
          <p className="mt-2 text-xs font-bold text-gray-400">{form.submitCount || 0}件 / {form.isActive === false ? '停止中' : '受付中'}</p>
        </div>
        <div className="flex shrink-0 flex-wrap justify-end gap-2">
          <button onClick={onEdit} className="rounded-xl border border-gray-200 px-3 py-2 text-xs font-bold text-gray-700 hover:bg-gray-50">
            編集
          </button>
          <button onClick={onOpenSubmissions} className="rounded-xl bg-emerald-500 px-3 py-2 text-xs font-bold text-white">
            回答を見る
          </button>
          <button onClick={onOpenReplySettings} className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-bold text-emerald-700 hover:bg-emerald-100">
            回答後LINE返信
          </button>
        </div>
      </div>
      <div className="mt-4 rounded-2xl border border-gray-100 bg-gray-50 p-4">
        <p className="mb-3 text-xs font-bold text-gray-400">プレビュー</p>
        <div className="space-y-3">
          {fields.length === 0 ? (
            <p className="text-sm text-gray-400">項目がありません。</p>
          ) : fields.slice(0, 5).map((field) => <PreviewField key={field.name || field.label} field={field} />)}
          {fields.length > 5 && <p className="text-xs font-bold text-gray-400">他 {fields.length - 5} 項目</p>}
        </div>
      </div>
    </article>
  )
}

function FormPreview({ name, description, fields }: { name: string; description: string; fields: ManagedField[] }) {
  return (
    <div className="rounded-2xl bg-white p-4 shadow-sm">
      <p className="text-base font-black text-gray-950">{name.trim() || 'フォーム名未設定'}</p>
      {description.trim() && <p className="mt-1 whitespace-pre-wrap text-sm text-gray-500">{description}</p>}
      <div className="mt-4 space-y-3">
        {fields.map((field, index) => <PreviewField key={`${field.name}-${index}`} field={field} />)}
      </div>
    </div>
  )
}

function PreviewField({ field }: { field: ManagedField }) {
  if (field.type === 'image') {
    return field.imageUrl ? <img src={field.imageUrl} alt={field.label} className="max-h-40 rounded-xl object-cover" /> : null
  }
  return (
    <div>
      <p className="mb-1 text-xs font-bold text-gray-600">{field.label || field.name}{field.required && <span className="ml-1 text-red-500">*</span>}</p>
      <div className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-gray-400">
        {field.type === 'select' || field.type === 'radio' || field.type === 'checkbox'
          ? (field.options?.[0] || '選択してください')
          : '入力欄'}
      </div>
    </div>
  )
}

function ReplySettingsModal({
  form,
  loading,
  saving,
  mode,
  content,
  setMode,
  setContent,
  onSave,
  onClose,
}: {
  form: FormWithFields
  loading: boolean
  saving: boolean
  mode: ReplyMode
  content: string
  setMode: (mode: ReplyMode) => void
  setContent: (value: string) => void
  onSave: () => void
  onClose: () => void
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-end bg-black/45 p-0 sm:items-center sm:p-4">
      <section className="max-h-[92vh] w-full overflow-y-auto rounded-t-3xl bg-white p-5 shadow-2xl sm:mx-auto sm:max-w-3xl sm:rounded-3xl">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-lg font-black text-gray-950">回答後LINE返信</p>
            <p className="mt-1 text-sm text-gray-500">{form.name}</p>
          </div>
          <button onClick={onClose} className="rounded-full bg-gray-100 px-3 py-1.5 text-sm font-bold text-gray-700">閉じる</button>
        </div>
        {loading ? (
          <p className="mt-4 rounded-2xl bg-gray-50 p-5 text-center text-sm text-gray-400">読み込み中...</p>
        ) : (
          <div className="mt-4 space-y-4">
            <div className="grid gap-2 sm:grid-cols-3">
              {(['none', 'text', 'flex'] as ReplyMode[]).map((item) => (
                <button
                  key={item}
                  onClick={() => setMode(item)}
                  className={`rounded-xl border px-3 py-2 text-sm font-bold ${mode === item ? 'border-emerald-500 bg-emerald-50 text-emerald-700' : 'border-gray-200 text-gray-600 hover:bg-gray-50'}`}
                >
                  {item === 'none' ? '送らない' : item === 'text' ? 'テキスト' : 'Flex JSON'}
                </button>
              ))}
            </div>
            {mode !== 'none' && (
              <textarea
                value={content}
                onChange={(event) => setContent(event.target.value)}
                rows={mode === 'flex' ? 14 : 6}
                className="w-full resize-y rounded-xl border border-gray-200 px-3 py-2 font-mono text-sm"
                placeholder={mode === 'text' ? '回答ありがとうございます。担当者からご連絡します。' : '{"type":"bubble","body":{"type":"box","layout":"vertical","contents":[]}}'}
              />
            )}
            <div className="rounded-2xl bg-gray-50 p-4 text-xs text-gray-500">
              使える変数: {'{{name}}'} / {'{{uid}}'} / {'{{friend_id}}'} / {'{{ref}}'} / {'{{metadata.保存キー}}'}
            </div>
            <div className="flex justify-end">
              <button onClick={onSave} disabled={saving} className="rounded-xl bg-emerald-500 px-4 py-2 text-sm font-bold text-white disabled:opacity-50">
                {saving ? '保存中' : '保存'}
              </button>
            </div>
          </div>
        )}
      </section>
    </div>
  )
}

function SubmissionsModal({
  form,
  submissions,
  loading,
  view,
  chatDetail,
  chatLoading,
  onBackToList,
  onClose,
  onOpenFriendChat,
}: {
  form: FormWithFields
  submissions: FormSubmission[]
  loading: boolean
  view: 'list' | 'chat'
  chatDetail: ChatDetail | null
  chatLoading: boolean
  onBackToList: () => void
  onClose: () => void
  onOpenFriendChat: (friendId: string) => void
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-end bg-black/45 p-0 sm:items-center sm:p-4">
      <section className="max-h-[92vh] w-full overflow-y-auto rounded-t-3xl bg-white p-5 shadow-2xl sm:mx-auto sm:max-w-4xl sm:rounded-3xl">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-lg font-black text-gray-950">{view === 'chat' ? 'チャット' : `${form.name} の回答`}</p>
            <p className="mt-1 text-sm text-gray-500">{view === 'chat' ? '戻るとフォーム回答リストに戻ります。' : '回答者のチャットを同じモーダル内で確認できます。'}</p>
          </div>
          <div className="flex gap-2">
            {view === 'chat' && <button onClick={onBackToList} className="rounded-full bg-gray-100 px-3 py-1.5 text-sm font-bold text-gray-700">戻る</button>}
            <button onClick={onClose} className="rounded-full bg-gray-100 px-3 py-1.5 text-sm font-bold text-gray-700">閉じる</button>
          </div>
        </div>
        {view === 'chat' ? (
          <ChatInSubmissionModal chatDetail={chatDetail} loading={chatLoading} />
        ) : (
        <div className="mt-4 space-y-3">
          {loading ? (
            <p className="rounded-2xl bg-gray-50 p-5 text-center text-sm text-gray-400">読み込み中...</p>
          ) : submissions.length === 0 ? (
            <p className="rounded-2xl bg-gray-50 p-5 text-center text-sm text-gray-400">回答はありません。</p>
          ) : submissions.map((submission) => (
            <article
              key={submission.id}
              className="w-full rounded-2xl border border-gray-100 bg-gray-50 p-4 text-left"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-black text-gray-950">{submission.friendName || '名前未取得'}</p>
                  <p className="mt-1 text-xs text-gray-400">{formatDateTime(submission.createdAt)}</p>
                </div>
                <button
                  onClick={() => submission.friendId && onOpenFriendChat(submission.friendId)}
                  disabled={!submission.friendId}
                  className="rounded-full bg-white px-3 py-1.5 text-xs font-bold text-gray-700 hover:bg-emerald-50 disabled:opacity-50"
                >
                  {submission.friendId ? 'チャット' : '未連携'}
                </button>
              </div>
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                {Object.entries(normalizeSubmissionData(submission.data)).slice(0, 6).map(([key, value]) => (
                  <div key={key} className="rounded-xl bg-white px-3 py-2">
                    <p className="text-[11px] font-bold text-gray-400">{key}</p>
                    <p className="mt-1 whitespace-pre-wrap text-sm font-semibold text-gray-800">{formatValue(value)}</p>
                  </div>
                ))}
              </div>
            </article>
          ))}
        </div>
        )}
      </section>
    </div>
  )
}

function ChatInSubmissionModal({ chatDetail, loading }: { chatDetail: ChatDetail | null; loading: boolean }) {
  if (loading) return <p className="mt-4 rounded-2xl bg-gray-50 p-5 text-center text-sm text-gray-400">チャットを読み込み中...</p>
  if (!chatDetail) return <p className="mt-4 rounded-2xl bg-gray-50 p-5 text-center text-sm text-gray-400">チャットを取得できませんでした。</p>
  return (
    <div className="mt-4 rounded-2xl bg-slate-50 p-4">
      <div className="mb-4 flex items-center gap-3">
        {chatDetail.friendPictureUrl ? (
          <img src={chatDetail.friendPictureUrl} alt="" className="h-10 w-10 rounded-full object-cover" />
        ) : (
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-white text-sm font-bold text-gray-500">
            {chatDetail.friendName?.charAt(0) || '?'}
          </div>
        )}
        <div>
          <p className="text-sm font-black text-gray-950">{chatDetail.friendName}</p>
          <p className="text-xs text-gray-400">メッセージ履歴</p>
        </div>
      </div>
      {!chatDetail.messages?.length ? (
        <p className="rounded-xl bg-white p-5 text-center text-sm text-gray-400">メッセージ履歴がありません。</p>
      ) : (
        <div className="max-h-[60vh] space-y-3 overflow-y-auto">
          {chatDetail.messages.map((msg) => {
            const outgoing = msg.direction === 'outgoing' || msg.senderType === 'operator'
            return (
              <LineMessageBubble
                key={msg.id}
                content={msg.content}
                messageType={msg.messageType}
                outgoing={outgoing}
                createdAt={msg.createdAt}
                avatarUrl={chatDetail.friendPictureUrl || undefined}
                maxWidth={outgoing || msg.messageType !== 'flex' ? 320 : 300}
              />
            )
          })}
        </div>
      )}
    </div>
  )
}

function normalizeFields(value: FormWithFields['fields']): ManagedField[] {
  if (Array.isArray(value)) return value
  if (typeof value !== 'string') return []
  try {
    const parsed = JSON.parse(value) as unknown
    return Array.isArray(parsed) ? parsed as ManagedField[] : []
  } catch {
    return []
  }
}

const fieldTypes: FieldType[] = ['text', 'email', 'tel', 'number', 'textarea', 'select', 'radio', 'checkbox', 'date', 'image']

const fieldTypeLabel: Record<FieldType, string> = {
  text: 'テキスト',
  email: 'メール',
  tel: '電話',
  number: '数値',
  textarea: '長文',
  select: '選択',
  radio: 'ラジオ',
  checkbox: 'チェック',
  date: '日付',
  image: '画像',
}

function emptyField(index: number, type: FieldType = 'text'): ManagedField {
  return { name: `field_${index}`, label: `項目${index}`, type, required: false, options: [] }
}

function normalizeField(field: ManagedField, index: number): ManagedField {
  const label = field.label.trim() || `項目${index}`
  const name = (field.name.trim() || label)
    .replace(/\s+/g, '_')
    .replace(/[^\w-]/g, '')
    .toLowerCase() || `field_${index}`
  const options = field.type === 'select' || field.type === 'radio' || field.type === 'checkbox'
    ? (field.options || []).map((item) => item.trim()).filter(Boolean)
    : []
  return { ...field, name, label, options }
}

function normalizeSubmissionData(value: FormSubmission['data']): Record<string, unknown> {
  if (typeof value !== 'string') return value || {}
  try {
    const parsed = JSON.parse(value) as unknown
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {}
  } catch {
    return {}
  }
}

function formatValue(value: unknown): string {
  if (Array.isArray(value)) return value.join(', ')
  if (value === null || value === undefined || value === '') return '-'
  if (typeof value === 'object') return JSON.stringify(value)
  return String(value)
}
