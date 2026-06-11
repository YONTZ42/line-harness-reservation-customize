'use client'

import { useState, useEffect, useCallback } from 'react'
import type { ReactNode } from 'react'
import type { Template } from '@line-harness/sdk'
import Header from '@/components/layout/header'
import CcPromptButton from '@/components/cc-prompt-button'
import FlexPreviewComponent from '@/components/flex-preview'
import { api, type ApiProviderConfig } from '@/lib/api'
import { createLineHarnessClient } from '@/lib/line-harness-client'
import {
  DEFAULT_RESERVATION_CARD,
  bookingUrlFromApiBase,
  buildProviderReservationCard,
  type ReservationCardForm,
} from '@/lib/provider-ui'

const messageTypeLabels: Record<string, string> = {
  text: 'テキスト',
  image: '画像',
  video: '動画',
  flex: 'Flex',
}

interface CreateFormState {
  name: string
  category: string
  messageType: string
  messageContent: string
}

interface FlexBubbleDraft {
  title: string
  body: string
  imageUrl: string
  buttonLabel: string
  buttonUrl: string
  footer: string
}

interface FlexDraftState {
  size: 'kilo' | 'mega' | 'giga'
  primaryColor: string
  deliveryShape: 'carousel' | 'messages'
  bubbles: FlexBubbleDraft[]
}

interface VideoDraftState {
  originalContentUrl: string
  previewImageUrl: string
  baseUrl: string
  linkUri: string
  linkLabel: string
}

type MessageObjectKind = 'text' | 'image' | 'video' | 'imagemapVideo' | 'flex'

interface MessageObjectDraft {
  id: string
  type: MessageObjectKind
  text: string
  imageUrl: string
  previewImageUrl: string
  videoUrl: string
  videoPreviewImageUrl: string
  imagemapBaseUrl: string
  imagemapLinkUri: string
  imagemapLinkLabel: string
  flex: FlexBubbleDraft
}

const emptyFlexBubble = (): FlexBubbleDraft => ({
  title: '新しいお知らせ',
  body: '本文を入力してください。',
  imageUrl: '',
  buttonLabel: '詳しく見る',
  buttonUrl: '',
  footer: '',
})

const initialFlexDraft = (): FlexDraftState => ({
  size: 'mega',
  primaryColor: '#06C755',
  deliveryShape: 'carousel',
  bubbles: [emptyFlexBubble()],
})

const emptyMessageObject = (type: MessageObjectKind = 'text'): MessageObjectDraft => ({
  id: crypto.randomUUID(),
  type,
  text: 'メッセージ本文を入力してください。',
  imageUrl: '',
  previewImageUrl: '',
  videoUrl: '',
  videoPreviewImageUrl: '',
  imagemapBaseUrl: '',
  imagemapLinkUri: '',
  imagemapLinkLabel: '詳しく見る',
  flex: emptyFlexBubble(),
})

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString('ja-JP', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

async function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result ?? ''))
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(file)
  })
}

const ccPrompts = [
  {
    title: 'テンプレート作成',
    prompt: `新しいメッセージテンプレートの作成をサポートしてください。
1. 用途別（挨拶、キャンペーン、通知、フォローアップ）のテンプレート文例を提案
2. テキスト・画像・Flexメッセージそれぞれの効果的な使い方
3. カテゴリ分類と命名規則のベストプラクティス
手順を示してください。`,
  },
  {
    title: 'テンプレート整理',
    prompt: `既存のテンプレートを整理・最適化してください。
1. カテゴリ別のテンプレート数と使用頻度を分析
2. 重複・類似テンプレートの統合提案
3. 不足しているカテゴリやテンプレートの追加推奨
結果をレポートしてください。`,
  },
]

export default function TemplatesPage() {
  const [templates, setTemplates] = useState<Template[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [showCreate, setShowCreate] = useState(false)
  const [selectedCategory, setSelectedCategory] = useState<string>('all')
  const [form, setForm] = useState<CreateFormState>({
    name: '',
    category: '',
    messageType: 'text',
    messageContent: '',
  })
  const [editingTemplateId, setEditingTemplateId] = useState<string | null>(null)
  const [editForm, setEditForm] = useState<CreateFormState>({
    name: '',
    category: '',
    messageType: 'text',
    messageContent: '',
  })
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')
  const [showReservationCard, setShowReservationCard] = useState(false)
  const [uploadingCardImage, setUploadingCardImage] = useState(false)
  const [uploadingTemplateImage, setUploadingTemplateImage] = useState(false)
  const [uploadingTemplateVideo, setUploadingTemplateVideo] = useState(false)
  const [flexDraft, setFlexDraft] = useState<FlexDraftState>(initialFlexDraft)
  const [videoDraft, setVideoDraft] = useState<VideoDraftState>({ originalContentUrl: '', previewImageUrl: '', baseUrl: '', linkUri: '', linkLabel: '詳しく見る' })
  const [messageDrafts, setMessageDrafts] = useState<MessageObjectDraft[]>([emptyMessageObject()])
  const [activeMessageIndex, setActiveMessageIndex] = useState(0)
  const [activeBubbleIndex, setActiveBubbleIndex] = useState(0)
  const [useJsonEditor, setUseJsonEditor] = useState(false)
  const [providerConfig, setProviderConfig] = useState<ApiProviderConfig | null>(null)
  const [reservationCard, setReservationCard] = useState<ReservationCardForm>(DEFAULT_RESERVATION_CARD)

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const client = createLineHarnessClient()
      setTemplates(await client.templates.list(selectedCategory !== 'all' ? selectedCategory : undefined))
    } catch {
      setError('テンプレートの読み込みに失敗しました。もう一度お試しください。')
    } finally {
      setLoading(false)
    }
  }, [selectedCategory])

  const loadProviderConfig = useCallback(async () => {
    try {
      const res = await api.providerConfig.get()
      if (res.success) setProviderConfig(res.data)
    } catch {
      // Keep legacy AONISAI defaults if provider config cannot be loaded.
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  useEffect(() => {
    loadProviderConfig()
  }, [loadProviderConfig])

  useEffect(() => {
    if (!providerConfig) return
    setReservationCard((current) => buildProviderReservationCard(
      current,
      providerConfig,
      bookingUrlFromApiBase(process.env.NEXT_PUBLIC_API_URL),
    ))
  }, [providerConfig])

  const categories = Array.from(
    new Set(templates.map((t) => t.category).filter(Boolean))
  )

  const generatedFlexJson = buildCustomFlexMessage(flexDraft)
  const generatedMessagesJson = buildLineMessagesTemplate(messageDrafts, flexDraft.size, flexDraft.primaryColor)

  useEffect(() => {
    if (!showCreate || form.messageType !== 'flex' || useJsonEditor) return
    setForm((current) => current.messageContent === generatedFlexJson ? current : {
      ...current,
      messageContent: generatedFlexJson,
    })
  }, [showCreate, form.messageType, generatedFlexJson, useJsonEditor])

  useEffect(() => {
    if (!showCreate || form.messageType !== 'messages' || useJsonEditor) return
    setForm((current) => current.messageContent === generatedMessagesJson ? current : {
      ...current,
      messageContent: generatedMessagesJson,
    })
  }, [showCreate, form.messageType, generatedMessagesJson, useJsonEditor])

  const handleCreate = async () => {
    if (!form.name.trim()) {
      setFormError('テンプレート名を入力してください')
      return
    }
    if (!form.category.trim()) {
      setFormError('カテゴリを入力してください')
      return
    }
    if (!form.messageContent.trim()) {
      setFormError('メッセージ内容を入力してください')
      return
    }
    setSaving(true)
    setFormError('')
    try {
      const client = createLineHarnessClient()
      await client.templates.create({
        name: form.name,
        category: form.category,
        messageType: (form.messageType === 'video' || form.messageType === 'imagemapVideo' || form.messageType === 'messages' ? 'flex' : form.messageType) as 'text' | 'image' | 'flex',
        messageContent: form.messageContent,
      })
      setShowCreate(false)
      setForm({ name: '', category: '', messageType: 'text', messageContent: '' })
      setFlexDraft(initialFlexDraft())
      setVideoDraft({ originalContentUrl: '', previewImageUrl: '', baseUrl: '', linkUri: '', linkLabel: '詳しく見る' })
      setMessageDrafts([emptyMessageObject()])
      setActiveMessageIndex(0)
      setActiveBubbleIndex(0)
      setUseJsonEditor(false)
      await load()
    } catch {
      setFormError('作成に失敗しました')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('このテンプレートを削除してもよいですか？')) return
    try {
      const client = createLineHarnessClient()
      await client.templates.delete(id)
      await load()
    } catch {
      setError('削除に失敗しました')
    }
  }

  const startEdit = (template: Template) => {
    setShowCreate(false)
    setShowReservationCard(false)
    setFormError('')
    setEditingTemplateId(template.id)
    setEditForm({
      name: template.name,
      category: template.category,
      messageType: template.messageType,
      messageContent: template.messageContent,
    })
  }

  const cancelEdit = () => {
    setEditingTemplateId(null)
    setFormError('')
    setEditForm({ name: '', category: '', messageType: 'text', messageContent: '' })
  }

  const handleUpdate = async () => {
    if (!editingTemplateId) return
    if (!editForm.name.trim()) {
      setFormError('テンプレート名を入力してください')
      return
    }
    if (!editForm.category.trim()) {
      setFormError('カテゴリを入力してください')
      return
    }
    if (!editForm.messageContent.trim()) {
      setFormError('メッセージ内容を入力してください')
      return
    }
    setSaving(true)
    setFormError('')
    try {
      const client = createLineHarnessClient()
      await client.templates.update(editingTemplateId, {
        name: editForm.name,
        category: editForm.category,
        messageType: editForm.messageType as 'text' | 'image' | 'flex',
        messageContent: editForm.messageContent,
      })
      cancelEdit()
      await load()
    } catch {
      setFormError('更新に失敗しました')
    } finally {
      setSaving(false)
    }
  }

  const reservationCardJson = buildReservationFlexCard(reservationCard)
  const canCreateReservationCard = Boolean(
    reservationCard.title.trim() &&
    reservationCard.body.trim() &&
    reservationCard.buttonLabel.trim() &&
    reservationCard.reservationUrl.trim().startsWith('https://')
  )

  const handleCreateReservationCard = async () => {
    if (!canCreateReservationCard || saving) {
      setFormError('タイトル、本文、ボタン名、https:// で始まる予約URLを入力してください')
      return
    }
    setSaving(true)
    setFormError('')
    try {
      const client = createLineHarnessClient()
      await client.templates.create({
        name: `予約導線カード - ${reservationCard.title.trim()}`,
        category: '予約',
        messageType: 'flex',
        messageContent: reservationCardJson,
      })
      setShowReservationCard(false)
      await load()
    } catch {
      setFormError('予約導線カードの作成に失敗しました')
    } finally {
      setSaving(false)
    }
  }

  const handleReservationImageUpload = async (file: File | undefined) => {
    if (!file) return
    if (!['image/png', 'image/jpeg', 'image/gif', 'image/webp'].includes(file.type)) {
      setFormError('画像は PNG / JPEG / GIF / WebP を選択してください')
      return
    }
    if (file.size > 5 * 1024 * 1024) {
      setFormError('画像は5MB以下にしてください')
      return
    }
    setUploadingCardImage(true)
    setFormError('')
    try {
      const client = createLineHarnessClient()
      const uploaded = await client.images.upload({
        data: await fileToDataUrl(file),
        mimeType: file.type,
        filename: file.name,
      })
      setReservationCard((prev) => ({ ...prev, imageUrl: uploaded.url }))
    } catch {
      setFormError('画像アップロードに失敗しました。R2 bindingとWorker URLを確認してください')
    } finally {
      setUploadingCardImage(false)
    }
  }

  const handleTemplateImageUpload = async (file: File | undefined, bubbleIndex: number) => {
    if (!file) return
    if (!['image/png', 'image/jpeg', 'image/gif', 'image/webp'].includes(file.type)) {
      setFormError('画像は PNG / JPEG / GIF / WebP を選択してください')
      return
    }
    if (file.size > 5 * 1024 * 1024) {
      setFormError('画像は5MB以下にしてください')
      return
    }
    setUploadingTemplateImage(true)
    setFormError('')
    try {
      const client = createLineHarnessClient()
      const uploaded = await client.images.upload({
        data: await fileToDataUrl(file),
        mimeType: file.type,
        filename: file.name,
      })
      setFlexDraft((current) => ({
        ...current,
        bubbles: current.bubbles.map((bubble, index) => (
          index === bubbleIndex ? { ...bubble, imageUrl: uploaded.url } : bubble
        )),
      }))
    } catch {
      setFormError('画像アップロードに失敗しました。R2 bindingとWorker URLを確認してください')
    } finally {
      setUploadingTemplateImage(false)
    }
  }

  const updateVideoMessageContent = (draft: VideoDraftState) => {
    const originalContentUrl = draft.originalContentUrl.trim()
    const previewImageUrl = draft.previewImageUrl.trim()
    const baseUrl = draft.baseUrl.trim()
    const linkUri = draft.linkUri.trim()
    const linkLabel = draft.linkLabel.trim() || '詳しく見る'
    setForm((current) => ({
      ...current,
      messageContent: current.messageType === 'imagemapVideo'
        ? originalContentUrl && previewImageUrl && baseUrl && linkUri
          ? JSON.stringify([buildImagemapVideoMessage({ originalContentUrl, previewImageUrl, baseUrl, linkUri, linkLabel })], null, 2)
          : ''
        : originalContentUrl && previewImageUrl
        ? JSON.stringify([{ type: 'video', originalContentUrl, previewImageUrl }], null, 2)
        : '',
    }))
  }

  const handleTemplateVideoUpload = async (file: File | undefined) => {
    if (!file) return
    if (file.type !== 'video/mp4') {
      setFormError('動画はMP4を選択してください')
      return
    }
    if (file.size > 25 * 1024 * 1024) {
      setFormError('動画は25MB以下にしてください')
      return
    }
    setUploadingTemplateVideo(true)
    setFormError('')
    try {
      const client = createLineHarnessClient()
      const uploaded = await client.images.upload({
        data: await fileToDataUrl(file),
        mimeType: file.type,
        filename: file.name,
      })
      const next = { ...videoDraft, originalContentUrl: uploaded.url }
      setVideoDraft(next)
      updateVideoMessageContent(next)
    } catch {
      setFormError('動画アップロードに失敗しました。R2 bindingとWorker URLを確認してください')
    } finally {
      setUploadingTemplateVideo(false)
    }
  }

  const handleTemplateVideoPreviewUpload = async (file: File | undefined) => {
    if (!file) return
    if (!['image/png', 'image/jpeg'].includes(file.type)) {
      setFormError('プレビュー画像はPNG/JPEGを選択してください')
      return
    }
    if (file.size > 1024 * 1024) {
      setFormError('プレビュー画像は1MB以下にしてください')
      return
    }
    setUploadingTemplateVideo(true)
    setFormError('')
    try {
      const client = createLineHarnessClient()
      const uploaded = await client.images.upload({
        data: await fileToDataUrl(file),
        mimeType: file.type,
        filename: file.name,
      })
      const next = { ...videoDraft, previewImageUrl: uploaded.url }
      setVideoDraft(next)
      updateVideoMessageContent(next)
    } catch {
      setFormError('プレビュー画像アップロードに失敗しました。R2 bindingとWorker URLを確認してください')
    } finally {
      setUploadingTemplateVideo(false)
    }
  }

  const handleTemplateImagemapBaseUpload = async (file: File | undefined) => {
    if (!file) return
    if (!['image/png', 'image/jpeg'].includes(file.type)) {
      setFormError('背景画像はPNG/JPEGを選択してください')
      return
    }
    if (file.size > 1024 * 1024) {
      setFormError('背景画像は1MB以下にしてください')
      return
    }
    setUploadingTemplateVideo(true)
    setFormError('')
    try {
      const client = createLineHarnessClient()
      const uploaded = await client.images.upload({
        data: await fileToDataUrl(file),
        mimeType: file.type,
        filename: file.name,
      })
      const next = { ...videoDraft, baseUrl: uploaded.url.replace('/images/', '/images/imagemap/') }
      setVideoDraft(next)
      updateVideoMessageContent(next)
    } catch {
      setFormError('背景画像アップロードに失敗しました。R2 bindingとWorker URLを確認してください')
    } finally {
      setUploadingTemplateVideo(false)
    }
  }

  const updateMessageDraft = (id: string, updates: Partial<MessageObjectDraft>) => {
    setMessageDrafts((current) => current.map((item) => item.id === id ? { ...item, ...updates } : item))
  }

  const updateMessageFlex = (id: string, updates: Partial<FlexBubbleDraft>) => {
    setMessageDrafts((current) => current.map((item) => (
      item.id === id ? { ...item, flex: { ...item.flex, ...updates } } : item
    )))
  }

  const addMessageDraft = () => {
    setMessageDrafts((current) => {
      if (current.length >= 5) return current
      const next = [...current, emptyMessageObject()]
      setActiveMessageIndex(next.length - 1)
      return next
    })
  }

  const removeMessageDraft = (id: string) => {
    setMessageDrafts((current) => {
      if (current.length <= 1) return current
      const next = current.filter((item) => item.id !== id)
      setActiveMessageIndex(Math.max(0, Math.min(activeMessageIndex, next.length - 1)))
      return next
    })
  }

  const handleMessageObjectMediaUpload = async (
    file: File | undefined,
    id: string,
    target: 'image' | 'imagePreview' | 'video' | 'videoPreview' | 'imagemapBase' | 'flexImage',
  ) => {
    if (!file) return
    const isVideo = target === 'video'
    const isPreviewImage = target === 'imagePreview' || target === 'videoPreview' || target === 'imagemapBase'
    const allowed = isVideo ? ['video/mp4'] : ['image/png', 'image/jpeg', ...(target === 'image' || target === 'flexImage' ? ['image/gif', 'image/webp'] : [])]
    if (!allowed.includes(file.type)) {
      setFormError(isVideo ? '動画はMP4を選択してください' : '画像形式が対応していません')
      return
    }
    const maxBytes = isVideo ? 25 * 1024 * 1024 : isPreviewImage ? 1024 * 1024 : 5 * 1024 * 1024
    if (file.size > maxBytes) {
      setFormError(isVideo ? '動画は25MB以下にしてください' : isPreviewImage ? 'プレビュー画像は1MB以下にしてください' : '画像は5MB以下にしてください')
      return
    }
    setUploadingTemplateVideo(true)
    setFormError('')
    try {
      const client = createLineHarnessClient()
      const uploaded = await client.images.upload({
        data: await fileToDataUrl(file),
        mimeType: file.type,
        filename: file.name,
      })
      if (target === 'image') updateMessageDraft(id, { imageUrl: uploaded.url, previewImageUrl: uploaded.url })
      if (target === 'imagePreview') updateMessageDraft(id, { previewImageUrl: uploaded.url })
      if (target === 'video') updateMessageDraft(id, { videoUrl: uploaded.url })
      if (target === 'videoPreview') updateMessageDraft(id, { videoPreviewImageUrl: uploaded.url })
      if (target === 'imagemapBase') updateMessageDraft(id, { imagemapBaseUrl: uploaded.url.replace('/images/', '/images/imagemap/') })
      if (target === 'flexImage') updateMessageFlex(id, { imageUrl: uploaded.url })
    } catch {
      setFormError('アップロードに失敗しました。R2 bindingとWorker URLを確認してください')
    } finally {
      setUploadingTemplateVideo(false)
    }
  }

  const updateActiveBubble = (updates: Partial<FlexBubbleDraft>) => {
    setFlexDraft((current) => ({
      ...current,
      bubbles: current.bubbles.map((bubble, index) => (
        index === activeBubbleIndex ? { ...bubble, ...updates } : bubble
      )),
    }))
  }

  const addFlexBubble = () => {
    setFlexDraft((current) => {
      if (current.bubbles.length >= 12) return current
      const next = { ...current, bubbles: [...current.bubbles, emptyFlexBubble()] }
      setActiveBubbleIndex(next.bubbles.length - 1)
      return next
    })
  }

  const removeActiveBubble = () => {
    setFlexDraft((current) => {
      if (current.bubbles.length <= 1) return current
      const nextBubbles = current.bubbles.filter((_, index) => index !== activeBubbleIndex)
      setActiveBubbleIndex(Math.max(0, activeBubbleIndex - 1))
      return { ...current, bubbles: nextBubbles }
    })
  }

  return (
    <div>
      <Header
        title="テンプレート管理"
        action={
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => { setShowReservationCard(true); setShowCreate(false) }}
              className="px-4 py-2 text-sm font-medium text-white rounded-lg transition-opacity hover:opacity-90"
              style={{ backgroundColor: '#06C755' }}
            >
              予約導線カードを作成
            </button>
            <button
              onClick={() => {
                setShowCreate(true)
                setShowReservationCard(false)
                setEditingTemplateId(null)
                setFormError('')
                setForm((current) => ({
                  ...current,
                  messageType: current.messageType === 'text' && !current.messageContent ? 'flex' : current.messageType,
                }))
              }}
              className="px-4 py-2 text-sm font-medium text-gray-700 rounded-lg bg-gray-100 hover:bg-gray-200"
            >
              + 新規テンプレート
            </button>
          </div>
        }
      />

      {/* Error */}
      {error && (
        <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
          {error}
        </div>
      )}

      {showReservationCard && (
        <div className="mb-6 bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <div className="mb-4 flex items-start justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold text-gray-800">予約導線カード設定</h2>
              <p className="mt-1 text-xs text-gray-500">フォーム入力からLINE FlexカードJSONを作成し、テンプレートとして保存します。</p>
            </div>
            <button onClick={() => setShowReservationCard(false)} className="text-xs text-gray-500 hover:text-gray-700">閉じる</button>
          </div>
          <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
            <div className="space-y-4">
              <Field label="カードタイトル">
                <input
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                  value={reservationCard.title}
                  onChange={(e) => setReservationCard({ ...reservationCard, title: e.target.value })}
                />
              </Field>
              <Field label="説明文">
                <textarea
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm resize-none"
                  rows={3}
                  value={reservationCard.body}
                  onChange={(e) => setReservationCard({ ...reservationCard, body: e.target.value })}
                />
              </Field>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="ボタン表示">
                  <input
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                    value={reservationCard.buttonLabel}
                    onChange={(e) => setReservationCard({ ...reservationCard, buttonLabel: e.target.value })}
                  />
                </Field>
                <Field label="フッター">
                  <input
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                    value={reservationCard.footer}
                    onChange={(e) => setReservationCard({ ...reservationCard, footer: e.target.value })}
                  />
                </Field>
              </div>
              <Field label="予約URL">
                <input
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                  placeholder="https://line-harness-reservation.../?page=book"
                  value={reservationCard.reservationUrl}
                  onChange={(e) => setReservationCard({ ...reservationCard, reservationUrl: e.target.value })}
                />
              </Field>
              <div className="rounded-lg border border-blue-100 bg-blue-50 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-bold text-blue-900">カード画像</p>
                    <p className="mt-1 text-xs leading-5 text-blue-800">
                      画像をR2に保存し、LINEが取得できる公開URLをカードに入れます。5MB以下のPNG/JPEG/GIF/WebPに対応します。
                    </p>
                  </div>
                  {uploadingCardImage && <span className="shrink-0 text-xs text-blue-700">アップロード中...</span>}
                </div>
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/gif,image/webp"
                  disabled={uploadingCardImage}
                  onChange={(e) => void handleReservationImageUpload(e.target.files?.[0])}
                  className="mt-3 block w-full text-xs text-gray-600 file:mr-3 file:rounded-md file:border-0 file:bg-white file:px-3 file:py-2 file:text-xs file:font-medium file:text-blue-700 disabled:opacity-50"
                />
                {reservationCard.imageUrl && (
                  <div className="mt-3 rounded-lg border border-blue-100 bg-white p-3">
                    <input readOnly value={reservationCard.imageUrl} className="w-full rounded border border-gray-200 px-2 py-1 font-mono text-xs text-gray-600" />
                    <img src={reservationCard.imageUrl} alt="予約導線カード画像" className="mt-3 max-h-36 rounded-lg border border-gray-100 object-contain" />
                  </div>
                )}
                <Field label="画像URLを直接指定する場合">
                  <input
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                    placeholder="https://..."
                    value={reservationCard.imageUrl}
                    onChange={(e) => setReservationCard({ ...reservationCard, imageUrl: e.target.value })}
                  />
                </Field>
              </div>
              <details className="rounded-lg border border-gray-200 bg-gray-50 p-3">
                <summary className="cursor-pointer text-xs font-semibold text-gray-700">生成されるFlex JSONを確認</summary>
                <textarea readOnly value={reservationCardJson} rows={10} className="mt-3 w-full rounded-lg border border-gray-200 bg-white p-3 font-mono text-xs text-gray-700" />
              </details>
              {formError && <p className="text-xs text-red-600">{formError}</p>}
              <div className="flex gap-2">
                <button
                  onClick={handleCreateReservationCard}
                  disabled={!canCreateReservationCard || saving}
                  className="px-4 py-2 text-sm font-medium text-white rounded-lg disabled:opacity-50"
                  style={{ backgroundColor: '#06C755' }}
                >
                  {saving ? '作成中...' : 'テンプレート保存'}
                </button>
                <button
                  onClick={() => setShowReservationCard(false)}
                  className="px-4 py-2 text-sm font-medium text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-lg"
                >
                  キャンセル
                </button>
              </div>
            </div>
            <div>
              <p className="mb-2 text-xs font-medium text-gray-600">プレビュー</p>
              <FlexPreviewComponent content={reservationCardJson} maxWidth={320} />
            </div>
          </div>
        </div>
      )}

      {editingTemplateId && (
        <div className="mb-6 bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <div className="mb-4 flex items-start justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold text-gray-800">テンプレートを編集</h2>
              <p className="mt-1 text-xs text-gray-500">
                保存済みテンプレートを更新します。自動化で内容コピー済みのJSONは自動更新されません。
              </p>
            </div>
            <button onClick={cancelEdit} className="text-xs text-gray-500 hover:text-gray-700">閉じる</button>
          </div>
          <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
            <div className="space-y-4">
              <Field label="テンプレート名">
                <input
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                  value={editForm.name}
                  onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                />
              </Field>
              <Field label="カテゴリ">
                <input
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                  value={editForm.category}
                  onChange={(e) => setEditForm({ ...editForm, category: e.target.value })}
                />
              </Field>
              <Field label="メッセージタイプ">
                <select
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 bg-white"
                  value={editForm.messageType}
                  onChange={(e) => setEditForm({ ...editForm, messageType: e.target.value })}
                >
                  <option value="text">テキスト</option>
                  <option value="image">画像</option>
                  <option value="flex">Flex</option>
                </select>
              </Field>
              <Field label="メッセージ内容">
                <textarea
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 resize-y"
                  rows={editForm.messageType === 'flex' ? 12 : 5}
                  value={editForm.messageContent}
                  onChange={(e) => setEditForm({ ...editForm, messageContent: e.target.value })}
                />
              </Field>
              {formError && <p className="text-xs text-red-600">{formError}</p>}
              <div className="flex gap-2">
                <button
                  onClick={handleUpdate}
                  disabled={saving}
                  className="px-4 py-2 text-sm font-medium text-white rounded-lg disabled:opacity-50"
                  style={{ backgroundColor: '#06C755' }}
                >
                  {saving ? '保存中...' : '保存'}
                </button>
                <button
                  onClick={cancelEdit}
                  className="px-4 py-2 text-sm font-medium text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-lg"
                >
                  キャンセル
                </button>
              </div>
            </div>
            <div>
              <p className="mb-2 text-xs font-medium text-gray-600">プレビュー</p>
              {editForm.messageType === 'flex' ? (
                <FlexPreviewComponent content={editForm.messageContent} maxWidth={320} />
              ) : editForm.messageType === 'image' ? (
                <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
                  <img src={editForm.messageContent} alt="画像テンプレート" className="max-h-64 rounded-lg object-contain" />
                </div>
              ) : (
                <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 text-sm text-gray-700 whitespace-pre-wrap">
                  {editForm.messageContent || 'テキストのプレビューがここに表示されます。'}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Category filter */}
      {!loading && categories.length > 0 && (
        <div className="mb-4 flex flex-wrap gap-2">
          <button
            onClick={() => setSelectedCategory('all')}
            className={`px-3 py-1.5 min-h-[44px] text-xs font-medium rounded-full transition-colors ${
              selectedCategory === 'all'
                ? 'text-white'
                : 'text-gray-600 bg-gray-100 hover:bg-gray-200'
            }`}
            style={selectedCategory === 'all' ? { backgroundColor: '#06C755' } : undefined}
          >
            全て
          </button>
          {categories.map((cat) => (
            <button
              key={cat}
              onClick={() => setSelectedCategory(cat)}
              className={`px-3 py-1.5 min-h-[44px] text-xs font-medium rounded-full transition-colors ${
                selectedCategory === cat
                  ? 'text-white'
                  : 'text-gray-600 bg-gray-100 hover:bg-gray-200'
              }`}
              style={selectedCategory === cat ? { backgroundColor: '#06C755' } : undefined}
            >
              {cat}
            </button>
          ))}
        </div>
      )}

      {/* Create form */}
      {showCreate && (
        <div className="mb-6 bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <div className="mb-4 flex items-start justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold text-gray-800">新規テンプレートを作成</h2>
              <p className="mt-1 text-xs text-gray-500">基本はプレビューを見ながらFlexを作ります。JSON直接編集は下の詳細設定に移しました。</p>
            </div>
            <button onClick={() => { setShowCreate(false); setFormError('') }} className="text-xs text-gray-500 hover:text-gray-700">閉じる</button>
          </div>
          <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
            <div className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="テンプレート名">
                  <input
                    type="text"
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                    placeholder="例: ウェルカムカード"
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                  />
                </Field>
                <Field label="カテゴリ">
                  <input
                    type="text"
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                    placeholder="例: 挨拶、キャンペーン、通知"
                    value={form.category}
                    onChange={(e) => setForm({ ...form, category: e.target.value })}
                  />
                </Field>
              </div>
              <Field label="メッセージタイプ">
                <select
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 bg-white"
                  value={form.messageType}
                  onChange={(e) => {
                    const messageType = e.target.value
                    setForm({
                      ...form,
                      messageType,
                      messageContent: messageType === 'flex' ? generatedFlexJson : messageType === 'messages' ? generatedMessagesJson : '',
                    })
                    setUseJsonEditor(false)
                  }}
                >
                  <option value="messages">複数メッセージ</option>
                  <option value="flex">Flexカード</option>
                  <option value="video">動画</option>
                  <option value="imagemapVideo">動画＋再生後リンク</option>
                  <option value="text">テキスト</option>
                  <option value="image">画像</option>
                </select>
              </Field>

              {form.messageType === 'messages' ? (
                <div className="space-y-4 rounded-lg border border-indigo-100 bg-indigo-50 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="text-xs font-bold text-indigo-900">LINE messages配列</p>
                      <p className="mt-1 text-xs text-indigo-800">1回の送信に最大5つのmessage objectを入れられます。</p>
                    </div>
                    <button
                      type="button"
                      onClick={addMessageDraft}
                      disabled={messageDrafts.length >= 5}
                      className="rounded-md bg-white px-3 py-2 text-xs font-semibold text-indigo-700 disabled:opacity-50"
                    >
                      メッセージ追加
                    </button>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {messageDrafts.map((message, index) => (
                      <button
                        key={message.id}
                        type="button"
                        onClick={() => setActiveMessageIndex(index)}
                        className={`rounded-full px-3 py-1.5 text-xs font-semibold ${
                          activeMessageIndex === index ? 'bg-indigo-600 text-white' : 'bg-white text-gray-700'
                        }`}
                      >
                        {index + 1}. {message.type}
                      </button>
                    ))}
                  </div>
                  {(() => {
                    const active = messageDrafts[activeMessageIndex] ?? messageDrafts[0]
                    if (!active) return null
                    return (
                      <div className="space-y-4 rounded-lg border border-indigo-100 bg-white p-4">
                        <div className="flex items-center justify-between gap-2">
                          <Field label="message object種別">
                            <select
                              value={active.type}
                              onChange={(e) => updateMessageDraft(active.id, { type: e.target.value as MessageObjectKind })}
                              className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm"
                            >
                              <option value="text">text</option>
                              <option value="image">image</option>
                              <option value="video">video</option>
                              <option value="imagemapVideo">video + end link</option>
                              <option value="flex">flex bubble</option>
                            </select>
                          </Field>
                          <button
                            type="button"
                            onClick={() => removeMessageDraft(active.id)}
                            disabled={messageDrafts.length <= 1}
                            className="mt-5 rounded-md bg-red-50 px-3 py-2 text-xs font-semibold text-red-600 disabled:opacity-50"
                          >
                            削除
                          </button>
                        </div>
                        {active.type === 'text' && (
                          <Field label="テキスト">
                            <textarea
                              value={active.text}
                              onChange={(e) => updateMessageDraft(active.id, { text: e.target.value })}
                              rows={4}
                              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                            />
                          </Field>
                        )}
                        {active.type === 'image' && (
                          <div className="space-y-3">
                            <Field label="画像アップロード">
                              <input
                                type="file"
                                accept="image/png,image/jpeg,image/gif,image/webp"
                                disabled={uploadingTemplateVideo}
                                onChange={(e) => void handleMessageObjectMediaUpload(e.target.files?.[0], active.id, 'image')}
                                className="block w-full text-xs text-gray-600 file:mr-3 file:rounded-md file:border-0 file:bg-indigo-50 file:px-3 file:py-2 file:text-xs file:font-medium file:text-indigo-700 disabled:opacity-50"
                              />
                            </Field>
                            <div className="grid gap-4 sm:grid-cols-2">
                              <Field label="画像URL">
                                <input value={active.imageUrl} onChange={(e) => updateMessageDraft(active.id, { imageUrl: e.target.value })} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
                              </Field>
                              <Field label="プレビュー画像URL">
                                <input value={active.previewImageUrl} onChange={(e) => updateMessageDraft(active.id, { previewImageUrl: e.target.value })} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
                              </Field>
                            </div>
                          </div>
                        )}
                        {(active.type === 'video' || active.type === 'imagemapVideo') && (
                          <div className="space-y-3">
                            {active.type === 'imagemapVideo' && (
                              <Field label="背景画像アップロード">
                                <input type="file" accept="image/png,image/jpeg" disabled={uploadingTemplateVideo} onChange={(e) => void handleMessageObjectMediaUpload(e.target.files?.[0], active.id, 'imagemapBase')} className="block w-full text-xs text-gray-600 file:mr-3 file:rounded-md file:border-0 file:bg-indigo-50 file:px-3 file:py-2 file:text-xs file:font-medium file:text-indigo-700 disabled:opacity-50" />
                              </Field>
                            )}
                            <div className="grid gap-4 sm:grid-cols-2">
                              <Field label="MP4アップロード">
                                <input type="file" accept="video/mp4" disabled={uploadingTemplateVideo} onChange={(e) => void handleMessageObjectMediaUpload(e.target.files?.[0], active.id, 'video')} className="block w-full text-xs text-gray-600 file:mr-3 file:rounded-md file:border-0 file:bg-indigo-50 file:px-3 file:py-2 file:text-xs file:font-medium file:text-indigo-700 disabled:opacity-50" />
                              </Field>
                              <Field label="プレビュー画像アップロード">
                                <input type="file" accept="image/png,image/jpeg" disabled={uploadingTemplateVideo} onChange={(e) => void handleMessageObjectMediaUpload(e.target.files?.[0], active.id, 'videoPreview')} className="block w-full text-xs text-gray-600 file:mr-3 file:rounded-md file:border-0 file:bg-indigo-50 file:px-3 file:py-2 file:text-xs file:font-medium file:text-indigo-700 disabled:opacity-50" />
                              </Field>
                            </div>
                            <div className="grid gap-4 sm:grid-cols-2">
                              <Field label="動画URL">
                                <input value={active.videoUrl} onChange={(e) => updateMessageDraft(active.id, { videoUrl: e.target.value })} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
                              </Field>
                              <Field label="プレビュー画像URL">
                                <input value={active.videoPreviewImageUrl} onChange={(e) => updateMessageDraft(active.id, { videoPreviewImageUrl: e.target.value })} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
                              </Field>
                            </div>
                            {active.type === 'imagemapVideo' && (
                              <>
                                <Field label="imagemap baseUrl">
                                  <input value={active.imagemapBaseUrl} onChange={(e) => updateMessageDraft(active.id, { imagemapBaseUrl: e.target.value })} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
                                </Field>
                                <div className="grid gap-4 sm:grid-cols-2">
                                  <Field label="再生後リンクURL">
                                    <input value={active.imagemapLinkUri} onChange={(e) => updateMessageDraft(active.id, { imagemapLinkUri: e.target.value })} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
                                  </Field>
                                  <Field label="再生後リンク表示">
                                    <input value={active.imagemapLinkLabel} onChange={(e) => updateMessageDraft(active.id, { imagemapLinkLabel: e.target.value })} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
                                  </Field>
                                </div>
                              </>
                            )}
                          </div>
                        )}
                        {active.type === 'flex' && (
                          <div className="space-y-3">
                            <Field label="画像アップロード">
                              <input type="file" accept="image/png,image/jpeg,image/gif,image/webp" disabled={uploadingTemplateVideo} onChange={(e) => void handleMessageObjectMediaUpload(e.target.files?.[0], active.id, 'flexImage')} className="block w-full text-xs text-gray-600 file:mr-3 file:rounded-md file:border-0 file:bg-indigo-50 file:px-3 file:py-2 file:text-xs file:font-medium file:text-indigo-700 disabled:opacity-50" />
                            </Field>
                            <Field label="画像URL">
                              <input value={active.flex.imageUrl} onChange={(e) => updateMessageFlex(active.id, { imageUrl: e.target.value })} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
                            </Field>
                            <Field label="タイトル">
                              <input value={active.flex.title} onChange={(e) => updateMessageFlex(active.id, { title: e.target.value })} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
                            </Field>
                            <Field label="本文">
                              <textarea value={active.flex.body} onChange={(e) => updateMessageFlex(active.id, { body: e.target.value })} rows={3} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
                            </Field>
                            <div className="grid gap-4 sm:grid-cols-2">
                              <Field label="ボタン表示">
                                <input value={active.flex.buttonLabel} onChange={(e) => updateMessageFlex(active.id, { buttonLabel: e.target.value })} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
                              </Field>
                              <Field label="ボタンURL">
                                <input value={active.flex.buttonUrl} onChange={(e) => updateMessageFlex(active.id, { buttonUrl: e.target.value })} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
                              </Field>
                            </div>
                          </div>
                        )}
                      </div>
                    )
                  })()}
                  <details className="rounded-lg border border-gray-200 bg-white p-3">
                    <summary className="cursor-pointer text-xs font-semibold text-gray-700">生成されるJSON</summary>
                    <textarea readOnly value={generatedMessagesJson} rows={10} className="mt-3 w-full rounded-lg border border-gray-200 bg-gray-50 p-3 font-mono text-xs text-gray-700" />
                  </details>
                </div>
              ) : form.messageType === 'flex' ? (
                <div className="space-y-4 rounded-lg border border-green-100 bg-green-50 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="text-xs font-bold text-green-900">Flexカスタム</p>
                      <p className="mt-1 text-xs text-green-800">
                        Flex carouselは最大12バブル、LINE messages配列は最大5 message objectsです。
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={addFlexBubble}
                      disabled={flexDraft.bubbles.length >= 12}
                      className="rounded-md bg-white px-3 py-2 text-xs font-semibold text-green-700 disabled:opacity-50"
                    >
                      バブル追加
                    </button>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {flexDraft.bubbles.map((bubble, index) => (
                      <button
                        key={index}
                        type="button"
                        onClick={() => setActiveBubbleIndex(index)}
                        className={`rounded-full px-3 py-1.5 text-xs font-semibold ${
                          activeBubbleIndex === index ? 'bg-green-600 text-white' : 'bg-white text-gray-700'
                        }`}
                      >
                        {index + 1}. {bubble.title || '未設定'}
                      </button>
                    ))}
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field label="保存形式">
                      <select
                        value={flexDraft.deliveryShape}
                        onChange={(e) => setFlexDraft({ ...flexDraft, deliveryShape: e.target.value as FlexDraftState['deliveryShape'] })}
                        className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm"
                      >
                        <option value="carousel">1つのFlex carouselにまとめる 最大12バブル</option>
                        <option value="messages">LINE messages配列で送る 最大5 message objects</option>
                      </select>
                    </Field>
                    <Field label="カードサイズ">
                      <select
                        value={flexDraft.size}
                        onChange={(e) => setFlexDraft({ ...flexDraft, size: e.target.value as FlexDraftState['size'] })}
                        className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm"
                      >
                        <option value="kilo">小さめ</option>
                        <option value="mega">標準</option>
                        <option value="giga">大きめ</option>
                      </select>
                    </Field>
                    <Field label="メインカラー">
                      <input
                        type="color"
                        value={flexDraft.primaryColor}
                        onChange={(e) => setFlexDraft({ ...flexDraft, primaryColor: e.target.value })}
                        className="h-10 w-full rounded-lg border border-gray-300 bg-white px-2 py-1"
                      />
                    </Field>
                  </div>
                  {flexDraft.deliveryShape === 'messages' && flexDraft.bubbles.length > 5 && (
                    <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                      messages配列では先頭5バブルだけを5つのFlex message objectsとして保存します。6枚目以降も使う場合はcarousel形式を選んでください。
                    </p>
                  )}
                  <Field label="画像アップロード">
                    <input
                      type="file"
                      accept="image/png,image/jpeg,image/gif,image/webp"
                      disabled={uploadingTemplateImage}
                      onChange={(e) => void handleTemplateImageUpload(e.target.files?.[0], activeBubbleIndex)}
                      className="block w-full text-xs text-gray-600 file:mr-3 file:rounded-md file:border-0 file:bg-white file:px-3 file:py-2 file:text-xs file:font-medium file:text-green-700 disabled:opacity-50"
                    />
                  </Field>
                  <Field label="画像URL">
                    <input
                      value={flexDraft.bubbles[activeBubbleIndex]?.imageUrl ?? ''}
                      onChange={(e) => updateActiveBubble({ imageUrl: e.target.value })}
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                      placeholder="https://..."
                    />
                  </Field>
                  <Field label="タイトル">
                    <input
                      value={flexDraft.bubbles[activeBubbleIndex]?.title ?? ''}
                      onChange={(e) => updateActiveBubble({ title: e.target.value })}
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                    />
                  </Field>
                  <Field label="本文">
                    <textarea
                      value={flexDraft.bubbles[activeBubbleIndex]?.body ?? ''}
                      onChange={(e) => updateActiveBubble({ body: e.target.value })}
                      rows={3}
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                    />
                  </Field>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field label="ボタン表示">
                      <input
                        value={flexDraft.bubbles[activeBubbleIndex]?.buttonLabel ?? ''}
                        onChange={(e) => updateActiveBubble({ buttonLabel: e.target.value })}
                        className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                      />
                    </Field>
                    <Field label="ボタンURL">
                      <input
                        value={flexDraft.bubbles[activeBubbleIndex]?.buttonUrl ?? ''}
                        onChange={(e) => updateActiveBubble({ buttonUrl: e.target.value })}
                        className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                        placeholder="https://..."
                      />
                    </Field>
                  </div>
                  <Field label="フッター">
                    <input
                      value={flexDraft.bubbles[activeBubbleIndex]?.footer ?? ''}
                      onChange={(e) => updateActiveBubble({ footer: e.target.value })}
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                    />
                  </Field>
                  <button
                    type="button"
                    onClick={removeActiveBubble}
                    disabled={flexDraft.bubbles.length <= 1}
                    className="rounded-md bg-white px-3 py-2 text-xs font-semibold text-red-600 disabled:opacity-50"
                  >
                    選択中のバブルを削除
                  </button>
                  <details className="rounded-lg border border-gray-200 bg-white p-3">
                    <summary className="cursor-pointer text-xs font-semibold text-gray-700">JSON詳細設定</summary>
                    <label className="mt-3 flex items-center gap-2 text-xs text-gray-600">
                      <input
                        type="checkbox"
                        checked={useJsonEditor}
                        onChange={(e) => {
                          setUseJsonEditor(e.target.checked)
                          if (!e.target.checked) setForm({ ...form, messageContent: generatedFlexJson })
                        }}
                      />
                      JSONを直接編集する
                    </label>
                    <textarea
                      readOnly={!useJsonEditor}
                      value={useJsonEditor ? form.messageContent : generatedFlexJson}
                      onChange={(e) => setForm({ ...form, messageContent: e.target.value })}
                      rows={10}
                      className="mt-3 w-full rounded-lg border border-gray-200 bg-gray-50 p-3 font-mono text-xs text-gray-700"
                    />
                  </details>
                </div>
              ) : form.messageType === 'video' || form.messageType === 'imagemapVideo' ? (
                <div className="space-y-4 rounded-lg border border-blue-100 bg-blue-50 p-4">
                  <div>
                    <p className="text-xs font-bold text-blue-900">{form.messageType === 'imagemapVideo' ? '動画＋再生後リンク' : '動画テンプレート'}</p>
                    <p className="mt-1 text-xs leading-5 text-blue-800">
                      {form.messageType === 'imagemapVideo'
                        ? '動画付きimagemapとして送信し、動画再生後にリンクボタンを表示します。'
                        : 'MP4動画とプレビュー画像をアップロードします。LINEにはvideo message objectとして送信されます。'}
                    </p>
                  </div>
                  {form.messageType === 'imagemapVideo' && (
                    <Field label="背景画像 PNG/JPEG 1MB以下">
                      <input
                        type="file"
                        accept="image/png,image/jpeg"
                        disabled={uploadingTemplateVideo}
                        onChange={(e) => void handleTemplateImagemapBaseUpload(e.target.files?.[0])}
                        className="block w-full text-xs text-gray-600 file:mr-3 file:rounded-md file:border-0 file:bg-white file:px-3 file:py-2 file:text-xs file:font-medium file:text-blue-700 disabled:opacity-50"
                      />
                    </Field>
                  )}
                  <Field label="動画ファイル MP4 25MB以下">
                    <input
                      type="file"
                      accept="video/mp4"
                      disabled={uploadingTemplateVideo}
                      onChange={(e) => void handleTemplateVideoUpload(e.target.files?.[0])}
                      className="block w-full text-xs text-gray-600 file:mr-3 file:rounded-md file:border-0 file:bg-white file:px-3 file:py-2 file:text-xs file:font-medium file:text-blue-700 disabled:opacity-50"
                    />
                  </Field>
                  <Field label="プレビュー画像 PNG/JPEG 1MB以下">
                    <input
                      type="file"
                      accept="image/png,image/jpeg"
                      disabled={uploadingTemplateVideo}
                      onChange={(e) => void handleTemplateVideoPreviewUpload(e.target.files?.[0])}
                      className="block w-full text-xs text-gray-600 file:mr-3 file:rounded-md file:border-0 file:bg-white file:px-3 file:py-2 file:text-xs file:font-medium file:text-blue-700 disabled:opacity-50"
                    />
                  </Field>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field label="動画URL">
                      <input
                        value={videoDraft.originalContentUrl}
                        onChange={(e) => {
                          const next = { ...videoDraft, originalContentUrl: e.target.value }
                          setVideoDraft(next)
                          updateVideoMessageContent(next)
                        }}
                        className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                        placeholder="https://..."
                      />
                    </Field>
                    <Field label="プレビュー画像URL">
                      <input
                        value={videoDraft.previewImageUrl}
                        onChange={(e) => {
                          const next = { ...videoDraft, previewImageUrl: e.target.value }
                          setVideoDraft(next)
                          updateVideoMessageContent(next)
                        }}
                        className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                        placeholder="https://..."
                      />
                    </Field>
                  </div>
                  {form.messageType === 'imagemapVideo' && (
                    <>
                      <Field label="imagemap baseUrl">
                        <input
                          value={videoDraft.baseUrl}
                          onChange={(e) => {
                            const next = { ...videoDraft, baseUrl: e.target.value }
                            setVideoDraft(next)
                            updateVideoMessageContent(next)
                          }}
                          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                          placeholder="https://.../images/imagemap/<key>"
                        />
                      </Field>
                      <div className="grid gap-4 sm:grid-cols-2">
                        <Field label="再生後リンクURL">
                          <input
                            value={videoDraft.linkUri}
                            onChange={(e) => {
                              const next = { ...videoDraft, linkUri: e.target.value }
                              setVideoDraft(next)
                              updateVideoMessageContent(next)
                            }}
                            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                            placeholder="https://..."
                          />
                        </Field>
                        <Field label="再生後リンク表示">
                          <input
                            value={videoDraft.linkLabel}
                            onChange={(e) => {
                              const next = { ...videoDraft, linkLabel: e.target.value }
                              setVideoDraft(next)
                              updateVideoMessageContent(next)
                            }}
                            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                            placeholder="詳しく見る"
                          />
                        </Field>
                      </div>
                    </>
                  )}
                  <details className="rounded-lg border border-gray-200 bg-white p-3">
                    <summary className="cursor-pointer text-xs font-semibold text-gray-700">生成されるJSON</summary>
                    <textarea readOnly value={form.messageContent} rows={6} className="mt-3 w-full rounded-lg border border-gray-200 bg-gray-50 p-3 font-mono text-xs text-gray-700" />
                  </details>
                </div>
              ) : (
                <Field label={form.messageType === 'image' ? '画像URL' : 'メッセージ内容'}>
                  <textarea
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 resize-none"
                    rows={4}
                    placeholder={form.messageType === 'image' ? 'https://...' : 'メッセージ内容を入力してください'}
                    value={form.messageContent}
                    onChange={(e) => setForm({ ...form, messageContent: e.target.value })}
                  />
                </Field>
              )}

              {formError && <p className="text-xs text-red-600">{formError}</p>}

              <div className="flex gap-2">
                <button
                  onClick={handleCreate}
                  disabled={saving}
                  className="px-4 py-2 text-sm font-medium text-white rounded-lg disabled:opacity-50 transition-opacity"
                  style={{ backgroundColor: '#06C755' }}
                >
                  {saving ? '作成中...' : '作成'}
                </button>
                <button
                  onClick={() => { setShowCreate(false); setFormError('') }}
                  className="px-4 py-2 text-sm font-medium text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
                >
                  キャンセル
                </button>
              </div>
            </div>
            <div>
              <p className="mb-2 text-xs font-medium text-gray-600">プレビュー</p>
              {form.messageType === 'flex' ? (
                <FlexPreviewComponent content={useJsonEditor ? form.messageContent : generatedFlexJson} maxWidth={flexDraft.size === 'giga' ? 340 : flexDraft.size === 'kilo' ? 260 : 300} />
              ) : form.messageType === 'messages' ? (
                <FlexPreviewComponent content={generatedMessagesJson} maxWidth={300} />
              ) : (form.messageType === 'video' || form.messageType === 'imagemapVideo') && form.messageContent.trim() ? (
                <FlexPreviewComponent content={form.messageContent} maxWidth={300} />
              ) : form.messageType === 'image' && form.messageContent.trim() ? (
                <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
                  <img src={form.messageContent.trim()} alt="画像テンプレート" className="max-h-64 rounded-lg object-contain" />
                </div>
              ) : (
                <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 text-sm text-gray-700 whitespace-pre-wrap">
                  {form.messageContent || 'プレビューがここに表示されます。'}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Loading skeleton */}
      {loading ? (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="px-4 py-4 border-b border-gray-100 flex items-center gap-4 animate-pulse">
              <div className="flex-1 space-y-2">
                <div className="h-3 bg-gray-200 rounded w-48" />
                <div className="h-2 bg-gray-100 rounded w-32" />
              </div>
              <div className="h-5 bg-gray-100 rounded-full w-16" />
              <div className="h-3 bg-gray-100 rounded w-24" />
            </div>
          ))}
        </div>
      ) : templates.length === 0 && !showCreate ? (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-12 text-center">
          <p className="text-gray-500">テンプレートがありません。「新規テンプレート」から作成してください。</p>
        </div>
      ) : (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
          <table className="w-full min-w-[640px]">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  テンプレート名
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  カテゴリ
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  メッセージタイプ
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  作成日時
                </th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {templates.map((template) => (
                <tr key={template.id} className="hover:bg-gray-50 transition-colors">
                  {/* Name */}
                  <td className="px-4 py-3">
                    <div>
                      <p className="text-sm font-medium text-gray-900">{template.name}</p>
                      <p className="text-xs text-gray-400 mt-0.5 truncate max-w-xs">
                        {template.messageContent.slice(0, 50)}
                        {template.messageContent.length > 50 ? '...' : ''}
                      </p>
                    </div>
                  </td>

                  {/* Category */}
                  <td className="px-4 py-3">
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-700">
                      {template.category}
                    </span>
                  </td>

                  {/* Message Type */}
                  <td className="px-4 py-3 text-sm text-gray-600">
                    {messageTypeLabels[template.messageType] || template.messageType}
                  </td>

                  {/* Created At */}
                  <td className="px-4 py-3 text-sm text-gray-500">
                    {formatDate(template.createdAt)}
                  </td>

                  {/* Actions */}
                  <td className="px-4 py-3 text-right">
                    <div className="flex justify-end gap-2">
                      <button
                        onClick={() => startEdit(template)}
                        className="px-3 py-1 text-xs font-medium text-gray-700 hover:text-gray-900 bg-gray-100 hover:bg-gray-200 rounded-md transition-colors"
                      >
                        編集
                      </button>
                      <button
                        onClick={() => handleDelete(template.id)}
                        className="px-3 py-1 text-xs font-medium text-red-500 hover:text-red-700 bg-red-50 hover:bg-red-100 rounded-md transition-colors"
                      >
                        削除
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        </div>
      )}
      <CcPromptButton prompts={ccPrompts} />
    </div>
  )
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="block text-xs font-medium text-gray-600 mb-1">{label}</span>
      {children}
    </label>
  )
}

function buildReservationFlexCard(input: ReservationCardForm): string {
  const title = input.title.trim() || '予約はこちら'
  const body = input.body.trim() || '予約画面から日付と時間を選択してください。'
  const buttonLabel = input.buttonLabel.trim() || '予約する'
  const reservationUrl = input.reservationUrl.trim()
  const footer = input.footer.trim()
  const imageUrl = input.imageUrl.trim()
  const primaryColor = input.primaryColor.trim() || '#69A3D0'

  const bubble: Record<string, unknown> = {
    type: 'bubble',
    size: 'mega',
    body: {
      type: 'box',
      layout: 'vertical',
      spacing: 'md',
      contents: [
        { type: 'text', text: title, weight: 'bold', size: 'xl', wrap: true, color: primaryColor },
        { type: 'text', text: body, size: 'sm', wrap: true, color: '#4B5563' },
      ],
    },
    footer: {
      type: 'box',
      layout: 'vertical',
      spacing: 'sm',
      contents: [
        {
          type: 'button',
          style: 'primary',
          color: primaryColor,
          action: { type: 'uri', label: buttonLabel, uri: reservationUrl || 'https://example.com' },
        },
        ...(footer ? [{ type: 'text', text: footer, size: 'xs', align: 'center', color: '#6B7280', wrap: true }] : []),
      ],
    },
  }

  if (imageUrl) {
    bubble.hero = {
      type: 'image',
      url: imageUrl,
      size: 'full',
      aspectRatio: '20:13',
      aspectMode: 'cover',
    }
  }

  return JSON.stringify(bubble, null, 2)
}

function buildCustomFlexMessage(input: FlexDraftState): string {
  if (input.deliveryShape === 'messages') {
    const messages = input.bubbles.slice(0, 5).map((bubble, index) => ({
      type: 'flex',
      altText: bubble.title.trim() || `Flex ${index + 1}`,
      contents: buildCustomFlexBubble(bubble, input.size, input.primaryColor),
    }))
    return JSON.stringify(messages, null, 2)
  }

  const bubbles = input.bubbles.slice(0, 12).map((bubble) => buildCustomFlexBubble(bubble, input.size, input.primaryColor))
  const contents = bubbles.length === 1
    ? bubbles[0]
    : { type: 'carousel', contents: bubbles }
  return JSON.stringify(contents, null, 2)
}

function buildLineMessagesTemplate(items: MessageObjectDraft[], size: FlexDraftState['size'], primaryColor: string): string {
  const messages = items.slice(0, 5).map((item, index) => {
    if (item.type === 'image') {
      const originalContentUrl = item.imageUrl.trim()
      const previewImageUrl = item.previewImageUrl.trim() || originalContentUrl
      return { type: 'image', originalContentUrl, previewImageUrl }
    }

    if (item.type === 'video') {
      return {
        type: 'video',
        originalContentUrl: item.videoUrl.trim(),
        previewImageUrl: item.videoPreviewImageUrl.trim(),
      }
    }

    if (item.type === 'imagemapVideo') {
      return buildImagemapVideoMessage({
        originalContentUrl: item.videoUrl.trim(),
        previewImageUrl: item.videoPreviewImageUrl.trim(),
        baseUrl: item.imagemapBaseUrl.trim(),
        linkUri: item.imagemapLinkUri.trim(),
        linkLabel: item.imagemapLinkLabel.trim() || '詳しく見る',
      })
    }

    if (item.type === 'flex') {
      return {
        type: 'flex',
        altText: item.flex.title.trim() || `Flex ${index + 1}`,
        contents: buildCustomFlexBubble(item.flex, size, primaryColor),
      }
    }

    return { type: 'text', text: item.text.trim() || ' ' }
  })

  return JSON.stringify(messages, null, 2)
}

function buildImagemapVideoMessage(input: {
  originalContentUrl: string
  previewImageUrl: string
  baseUrl: string
  linkUri: string
  linkLabel: string
}): Record<string, unknown> {
  return {
    type: 'imagemap',
    baseUrl: input.baseUrl,
    altText: input.linkLabel || '動画',
    baseSize: { width: 1040, height: 1040 },
    video: {
      originalContentUrl: input.originalContentUrl,
      previewImageUrl: input.previewImageUrl,
      area: { x: 0, y: 0, width: 1040, height: 585 },
      externalLink: {
        linkUri: input.linkUri,
        label: input.linkLabel || '詳しく見る',
      },
    },
    actions: [],
  }
}

function buildCustomFlexBubble(input: FlexBubbleDraft, size: FlexDraftState['size'], primaryColor: string): Record<string, unknown> {
  const title = input.title.trim() || 'タイトル'
  const body = input.body.trim() || '本文を入力してください。'
  const imageUrl = input.imageUrl.trim()
  const buttonLabel = input.buttonLabel.trim()
  const buttonUrl = input.buttonUrl.trim()
  const footer = input.footer.trim()

  const bubble: Record<string, unknown> = {
    type: 'bubble',
    size,
    body: {
      type: 'box',
      layout: 'vertical',
      spacing: 'md',
      contents: [
        { type: 'text', text: title, weight: 'bold', size: 'xl', wrap: true, color: primaryColor },
        { type: 'text', text: body, size: 'sm', wrap: true, color: '#4B5563' },
      ],
    },
  }

  if (imageUrl) {
    bubble.hero = {
      type: 'image',
      url: imageUrl,
      size: 'full',
      aspectRatio: '20:13',
      aspectMode: 'cover',
    }
  }

  if (buttonLabel || footer) {
    bubble.footer = {
      type: 'box',
      layout: 'vertical',
      spacing: 'sm',
      contents: [
        ...(buttonLabel ? [{
          type: 'button',
          style: 'primary',
          color: primaryColor,
          action: { type: 'uri', label: buttonLabel, uri: buttonUrl || 'https://example.com' },
        }] : []),
        ...(footer ? [{ type: 'text', text: footer, size: 'xs', align: 'center', color: '#6B7280', wrap: true }] : []),
      ],
    }
  }

  return bubble
}
