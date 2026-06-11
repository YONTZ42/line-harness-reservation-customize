'use client'

import { useCallback, useEffect, useMemo, useState, type PointerEvent } from 'react'
import type { RichMenu, RichMenuAction, RichMenuArea } from '@line-harness/sdk'
import { useAccount } from '@/contexts/account-context'
import Header from '@/components/layout/header'
import { createLineHarnessClient } from '@/lib/line-harness-client'

type SizePreset = 'full' | 'half'
type LayoutPreset = 'custom' | '3' | '6'
type ActionType = 'uri' | 'message' | 'postback' | 'richmenuswitch'

type AreaForm = {
  id: string
  label: string
  type: ActionType
  value: string
  displayText: string
  x: number
  y: number
  width: number
  height: number
}

type DraftImage = {
  file: File
  dataUrl: string
  contentType: 'image/png' | 'image/jpeg'
}

type AreaDragState = {
  areaId: string
  mode: 'move' | 'resize'
  startClientX: number
  startClientY: number
  initial: Pick<AreaForm, 'x' | 'y' | 'width' | 'height'>
}

const MAX_AREAS = 20

const sizeOptions: Record<SizePreset, { label: string; width: number; height: number }> = {
  full: { label: 'フルサイズ 2500x1686', width: 2500, height: 1686 },
  half: { label: 'ハーフサイズ 2500x843', width: 2500, height: 843 },
}

function newArea(index: number, size: SizePreset): AreaForm {
  const preset = sizeOptions[size]
  return {
    id: crypto.randomUUID(),
    label: `エリア${index + 1}`,
    type: 'uri',
    value: '',
    displayText: '',
    x: 0,
    y: Math.min(index * 120, Math.max(0, preset.height - 120)),
    width: 600,
    height: 120,
  }
}

function presetBounds(index: number, layout: Exclude<LayoutPreset, 'custom'>, size: SizePreset) {
  if (layout === '3') {
    const width = index === 2 ? 834 : 833
    return { x: index * 833, y: 0, width, height: 843 }
  }

  const row = Math.floor(index / 3)
  const col = index % 3
  const width = col === 2 ? 834 : 833
  return { x: col * 833, y: row * 843, width, height: size === 'full' ? 843 : 421 }
}

function createPresetAreas(layout: Exclude<LayoutPreset, 'custom'>, size: SizePreset): AreaForm[] {
  const count = layout === '3' ? 3 : 6
  return Array.from({ length: count }, (_, index) => ({
    ...newArea(index, size),
    ...presetBounds(index, layout, size),
  }))
}

function toAction(area: AreaForm): RichMenuAction {
  const label = area.label.trim() || undefined
  const value = area.value.trim()
  if (area.type === 'message') return { type: 'message', text: value, label }
  if (area.type === 'postback') {
    const displayText = area.displayText.trim()
    return { type: 'postback', data: value, ...(displayText ? { displayText } : {}), label }
  }
  if (area.type === 'richmenuswitch') {
    return {
      type: 'richmenuswitch',
      richMenuAliasId: value,
      data: area.displayText.trim() || `switch:${value}`,
      label,
    }
  }
  return { type: 'uri', uri: value, label }
}

function fromAction(action: RichMenuAction, index: number, bounds: RichMenuArea['bounds']): AreaForm {
  const base = {
    id: crypto.randomUUID(),
    label: 'label' in action && action.label ? action.label : `エリア${index + 1}`,
    x: bounds.x,
    y: bounds.y,
    width: bounds.width,
    height: bounds.height,
  }

  if (action.type === 'message') {
    return { ...base, type: 'message', value: action.text, displayText: '' }
  }

  if (action.type === 'postback') {
    return { ...base, type: 'postback', value: action.data, displayText: action.displayText ?? '' }
  }

  if (action.type === 'richmenuswitch') {
    return { ...base, type: 'richmenuswitch', value: action.richMenuAliasId, displayText: action.data }
  }

  if (action.type === 'uri') {
    return { ...base, type: 'uri', value: action.uri, displayText: '' }
  }

  return { ...base, type: 'postback', value: action.data, displayText: `${action.mode} picker` }
}

function actionSummary(action: RichMenuAction) {
  if (action.type === 'uri') return action.uri
  if (action.type === 'message') return action.text
  if (action.type === 'richmenuswitch') return `${action.richMenuAliasId} / ${action.data}`
  if (action.type === 'datetimepicker') return `${action.mode} / ${action.data}`
  return action.data
}

function formatSize(menu: RichMenu) {
  return `${menu.size.width} x ${menu.size.height}`
}

async function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result ?? ''))
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(file)
  })
}

async function urlToDraftImage(url: string, filename: string): Promise<DraftImage> {
  const response = await fetch(url)
  if (!response.ok) throw new Error('既存画像の読み込みに失敗しました')
  const blob = await response.blob()
  if (blob.type !== 'image/png' && blob.type !== 'image/jpeg') {
    throw new Error('既存画像がPNG/JPEGではありません。画像を再アップロードしてください')
  }
  const file = new File([blob], filename, { type: blob.type })
  const imageError = validateImageFile(file)
  if (imageError) throw new Error(imageError)
  return {
    file,
    dataUrl: await fileToDataUrl(file),
    contentType: blob.type as 'image/png' | 'image/jpeg',
  }
}

function validateAreas(areas: AreaForm[], size: { width: number; height: number }) {
  if (areas.length < 1) return 'タップ領域を1つ以上設定してください'
  if (areas.length > MAX_AREAS) return `タップ領域は最大${MAX_AREAS}個です`

  for (const [index, area] of areas.entries()) {
    const label = `領域${index + 1}`
    if (!area.value.trim()) return `${label}のアクション値を入力してください`
    if (area.width <= 0 || area.height <= 0) return `${label}の幅と高さは1以上にしてください`
    if (area.x < 0 || area.y < 0) return `${label}のx/yは0以上にしてください`
    if (area.x + area.width > size.width) return `${label}が画像の横幅を超えています`
    if (area.y + area.height > size.height) return `${label}が画像の高さを超えています`
    if (area.type === 'richmenuswitch' && !/^[A-Za-z0-9_-]{1,32}$/.test(area.value.trim())) {
      return `${label}の切替先エイリアスIDは1-32文字の英数字・_・-で入力してください`
    }
  }
  return ''
}

function clampArea(area: AreaForm, size: { width: number; height: number }): AreaForm {
  const width = Math.max(1, Math.min(Math.round(area.width), size.width))
  const height = Math.max(1, Math.min(Math.round(area.height), size.height))
  const x = Math.max(0, Math.min(Math.round(area.x), size.width - width))
  const y = Math.max(0, Math.min(Math.round(area.y), size.height - height))
  return { ...area, x, y, width, height }
}

function validateImageFile(file: File): string {
  if (file.type !== 'image/png' && file.type !== 'image/jpeg') {
    return '画像はPNGまたはJPEGを選択してください'
  }
  if (file.size > 1024 * 1024) {
    return 'LINEの制約に合わせ、画像は1MB以下にしてください'
  }
  return ''
}

export default function RichMenusPage() {
  const { selectedAccountId, selectedAccount } = useAccount()
  const [menus, setMenus] = useState<RichMenu[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [uploadingId, setUploadingId] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [showCreate, setShowCreate] = useState(false)
  const [editingMenu, setEditingMenu] = useState<RichMenu | null>(null)
  const [createdRichMenuId, setCreatedRichMenuId] = useState('')
  const [draftImage, setDraftImage] = useState<DraftImage | null>(null)
  const [selectedAreaId, setSelectedAreaId] = useState<string | null>(null)
  const [areaDrag, setAreaDrag] = useState<AreaDragState | null>(null)
  const [imagePreviews, setImagePreviews] = useState<Record<string, { url: string; key: string; mimeType: string }>>({})
  const [aliasForm, setAliasForm] = useState({ richMenuAliasId: '', richMenuId: '', oldRichMenuId: '' })
  const [form, setForm] = useState({
    name: 'メインメニュー',
    chatBarText: 'メニュー',
    selected: true,
    size: 'full' as SizePreset,
    layout: '6' as LayoutPreset,
    areas: createPresetAreas('6', 'full'),
    setDefaultAfterCreate: false,
  })

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const client = createLineHarnessClient(selectedAccountId)
      const loadedMenus = await client.richMenus.list()
      setMenus(loadedMenus)
      const previews = loadedMenus.reduce<Record<string, { url: string; key: string; mimeType: string }>>((acc, menu) => {
        if (menu.imageAsset) {
          acc[menu.richMenuId] = {
            url: menu.imageAsset.image_url,
            key: menu.imageAsset.image_key,
            mimeType: menu.imageAsset.mime_type,
          }
        }
        return acc
      }, {})
      setImagePreviews(previews)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'リッチメニュー一覧の取得に失敗しました')
    } finally {
      setLoading(false)
    }
  }, [selectedAccountId])

  useEffect(() => {
    void load()
  }, [load])

  const size = sizeOptions[form.size]
  const validationError = useMemo(() => {
    if (!form.name.trim()) return '管理名を入力してください'
    if (!form.chatBarText.trim()) return 'チャットバー表示を入力してください'
    if (!draftImage) return '先にリッチメニュー画像を選択してください'
    return validateAreas(form.areas, size)
  }, [draftImage, form, size])
  const canCreate = !validationError

  const selectedArea = form.areas.find((area) => area.id === selectedAreaId) ?? form.areas[0] ?? null

  function applyLayout(layout: LayoutPreset) {
    setForm((prev) => {
      if (layout === 'custom') return { ...prev, layout }
      const nextSize = layout === '6' ? 'full' : prev.size
      return {
        ...prev,
        layout,
        size: nextSize,
        areas: createPresetAreas(layout, nextSize),
      }
    })
  }

  function resetCreateForm() {
    setEditingMenu(null)
    setCreatedRichMenuId('')
    setDraftImage(null)
    setSelectedAreaId(null)
    setAreaDrag(null)
    setForm({
      name: 'メインメニュー',
      chatBarText: 'メニュー',
      selected: true,
      size: 'full',
      layout: '6',
      areas: createPresetAreas('6', 'full'),
      setDefaultAfterCreate: false,
    })
  }

  async function startEdit(menu: RichMenu) {
    setShowCreate(true)
    setEditingMenu(menu)
    setCreatedRichMenuId('')
    setError('')
    setNotice('')
    const sizePreset: SizePreset = menu.size.height <= sizeOptions.half.height ? 'half' : 'full'
    const areas = menu.areas.map((area, index) => fromAction(area.action, index, area.bounds))
    setForm({
      name: `${menu.name} の編集版`,
      chatBarText: menu.chatBarText,
      selected: menu.selected,
      size: sizePreset,
      layout: 'custom',
      areas: areas.length ? areas : [newArea(0, sizePreset)],
      setDefaultAfterCreate: false,
    })
    setSelectedAreaId(areas[0]?.id ?? null)

    const preview = imagePreviews[menu.richMenuId]
    if (!preview) {
      setDraftImage(null)
      setNotice('既存リッチメニューを編集フォームに読み込みました。画像は保存されていないため、再アップロードしてください。')
      return
    }

    try {
      setDraftImage(await urlToDraftImage(preview.url, `${menu.richMenuId}.${preview.mimeType === 'image/png' ? 'png' : 'jpg'}`))
      setNotice('既存リッチメニューを編集フォームに読み込みました。保存すると新しいリッチメニューIDとして作成します。')
    } catch (err) {
      setDraftImage(null)
      setNotice(err instanceof Error ? `${err.message} 編集保存前に画像を再アップロードしてください。` : '既存画像を読み込めませんでした。編集保存前に画像を再アップロードしてください。')
    }
  }

  function updateArea(id: string, patch: Partial<AreaForm>) {
    setForm((prev) => ({
      ...prev,
      layout: prev.layout === 'custom' ? prev.layout : 'custom',
      areas: prev.areas.map((area) => area.id === id ? clampArea({ ...area, ...patch }, sizeOptions[prev.size]) : area),
    }))
  }

  function addArea() {
    setForm((prev) => {
      if (prev.areas.length >= MAX_AREAS) return prev
      return {
        ...prev,
        layout: 'custom',
        areas: [...prev.areas, newArea(prev.areas.length, prev.size)],
      }
    })
  }

  function removeArea(id: string) {
    setForm((prev) => ({
      ...prev,
      layout: 'custom',
      areas: prev.areas.filter((area) => area.id !== id),
    }))
    if (selectedAreaId === id) setSelectedAreaId(null)
  }

  async function handleDraftImage(file: File | undefined) {
    if (!file) return
    const imageError = validateImageFile(file)
    if (imageError) {
      setError(imageError)
      return
    }
    setError('')
    setNotice('')
    setDraftImage({
      file,
      dataUrl: await fileToDataUrl(file),
      contentType: file.type as 'image/png' | 'image/jpeg',
    })
  }

  function handleAreaPointerDown(event: PointerEvent<HTMLElement>, area: AreaForm, mode: 'move' | 'resize') {
    event.preventDefault()
    event.stopPropagation()
    setSelectedAreaId(area.id)
    setAreaDrag({
      areaId: area.id,
      mode,
      startClientX: event.clientX,
      startClientY: event.clientY,
      initial: {
        x: area.x,
        y: area.y,
        width: area.width,
        height: area.height,
      },
    })
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  function handlePreviewPointerMove(event: PointerEvent<HTMLDivElement>) {
    if (!areaDrag) return
    const rect = event.currentTarget.getBoundingClientRect()
    const dx = ((event.clientX - areaDrag.startClientX) / rect.width) * size.width
    const dy = ((event.clientY - areaDrag.startClientY) / rect.height) * size.height

    if (areaDrag.mode === 'resize') {
      updateArea(areaDrag.areaId, {
        width: areaDrag.initial.width + dx,
        height: areaDrag.initial.height + dy,
      })
      return
    }

    updateArea(areaDrag.areaId, {
      x: areaDrag.initial.x + dx,
      y: areaDrag.initial.y + dy,
    })
  }

  function handlePreviewPointerUp() {
    setAreaDrag(null)
  }

  async function handleCreate() {
    if (!canCreate || saving) {
      if (validationError) setError(validationError)
      return
    }
    setSaving(true)
    setError('')
    setNotice('')
    setCreatedRichMenuId('')
    try {
      const areas: RichMenuArea[] = form.areas.map((area) => ({
        bounds: {
          x: Math.round(area.x),
          y: Math.round(area.y),
          width: Math.round(area.width),
          height: Math.round(area.height),
        },
        action: toAction(area),
      }))
      const client = createLineHarnessClient(selectedAccountId)
      const result = await client.richMenus.create({
        size: { width: size.width, height: size.height },
        selected: form.selected,
        name: form.name.trim(),
        chatBarText: form.chatBarText.trim(),
        areas,
      })
      if (!draftImage) throw new Error('画像を選択してください')
      const uploaded = await client.images.upload({
        body: draftImage.file,
        mimeType: draftImage.contentType,
        filename: draftImage.file.name,
      })
      await client.richMenus.uploadImage(
        result.richMenuId,
        draftImage.dataUrl,
        draftImage.contentType,
        {
          asset: {
            key: uploaded.key,
            url: uploaded.url,
            mimeType: uploaded.mimeType,
            size: uploaded.size,
          },
        },
      )
      if (form.setDefaultAfterCreate) {
        await client.richMenus.setDefault(result.richMenuId)
      }
      setCreatedRichMenuId(result.richMenuId)
      setImagePreviews((prev) => ({
        ...prev,
        [result.richMenuId]: {
          url: uploaded.url,
          key: uploaded.key,
          mimeType: uploaded.mimeType,
        },
      }))
      setAliasForm((prev) => ({ ...prev, richMenuId: result.richMenuId }))
      setNotice(editingMenu
        ? `編集版リッチメニューを新規作成しました。旧ID ${editingMenu.richMenuId} は安全のため残しています。エイリアスを使っている場合は新IDへ保存し直してください。`
        : '画像付きリッチメニューを作成しました。必要に応じてデフォルト設定やエイリアス保存をしてください。')
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'リッチメニュー作成に失敗しました')
    } finally {
      setSaving(false)
    }
  }

  async function handleUpload(richMenuId: string, file: File | undefined) {
    if (!file) return
    const imageError = validateImageFile(file)
    if (imageError) {
      setError(imageError)
      return
    }
    setUploadingId(richMenuId)
    setError('')
    setNotice('')
    try {
      const image = await fileToDataUrl(file)
      const client = createLineHarnessClient(selectedAccountId)
      const uploaded = await client.images.upload({
        body: file,
        mimeType: file.type,
        filename: file.name,
      })
      setImagePreviews((prev) => ({
        ...prev,
        [richMenuId]: {
          url: uploaded.url,
          key: uploaded.key,
          mimeType: uploaded.mimeType,
        },
      }))
      await client.richMenus.uploadImage(
        richMenuId,
        image,
        file.type as 'image/png' | 'image/jpeg',
        {
          asset: {
            key: uploaded.key,
            url: uploaded.url,
            mimeType: uploaded.mimeType,
            size: uploaded.size,
          },
        },
      )
      setNotice('画像をR2に保存し、LINEリッチメニュー画像として登録しました。必要に応じてデフォルト設定してください。')
    } catch (err) {
      setError(err instanceof Error ? err.message : '画像アップロードまたはLINE登録に失敗しました')
    } finally {
      setUploadingId(null)
    }
  }

  async function handleSetDefault(richMenuId: string) {
    const ok = confirm('このリッチメニューを全友だちのデフォルトに設定します。既存のデフォルト表示が切り替わります。実行しますか？')
    if (!ok) return
    setError('')
    setNotice('')
    try {
      const client = createLineHarnessClient(selectedAccountId)
      await client.richMenus.setDefault(richMenuId)
      setNotice('デフォルトリッチメニューを設定しました')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'デフォルト設定に失敗しました')
    }
  }

  async function handleDelete(richMenuId: string) {
    const ok = confirm('LINE Platform上のリッチメニューを削除します。画像や設定も利用できなくなります。削除しますか？')
    if (!ok) return
    setError('')
    setNotice('')
    try {
      const client = createLineHarnessClient(selectedAccountId)
      await client.richMenus.delete(richMenuId)
      setNotice('リッチメニューを削除しました')
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : '削除に失敗しました')
    }
  }

  async function handleSaveAlias() {
    const richMenuAliasId = aliasForm.richMenuAliasId.trim()
    const richMenuId = aliasForm.richMenuId.trim()
    if (!richMenuAliasId || !richMenuId) {
      setError('エイリアスIDとリッチメニューIDを入力してください')
      return
    }
    setError('')
    setNotice('')
    try {
      const client = createLineHarnessClient(selectedAccountId)
      await client.richMenus.saveAlias(richMenuAliasId, richMenuId, { upsert: true })
      setNotice(`エイリアス ${richMenuAliasId} を保存しました`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'エイリアス保存に失敗しました')
    }
  }

  async function handleReplaceAliasAndDeleteOld() {
    const richMenuAliasId = aliasForm.richMenuAliasId.trim()
    const richMenuId = aliasForm.richMenuId.trim()
    const oldRichMenuId = aliasForm.oldRichMenuId.trim()
    if (!richMenuAliasId || !richMenuId || !oldRichMenuId) {
      setError('エイリアスID、新しいリッチメニューID、削除する旧リッチメニューIDを入力してください')
      return
    }
    if (richMenuId === oldRichMenuId) {
      setError('新しいリッチメニューIDと削除する旧リッチメニューIDが同じです')
      return
    }
    const ok = confirm(`エイリアス ${richMenuAliasId} を新IDへ差し替えた後、旧リッチメニュー ${oldRichMenuId} を削除します。実行しますか？`)
    if (!ok) return
    setError('')
    setNotice('')
    try {
      const client = createLineHarnessClient(selectedAccountId)
      await client.richMenus.saveAlias(richMenuAliasId, richMenuId, { upsert: true })
      await client.richMenus.delete(oldRichMenuId)
      setNotice(`エイリアス ${richMenuAliasId} を ${richMenuId} に差し替え、旧リッチメニュー ${oldRichMenuId} を削除しました`)
      setAliasForm((prev) => ({ ...prev, oldRichMenuId: '' }))
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'エイリアス差し替えまたは旧リッチメニュー削除に失敗しました')
    }
  }

  async function handleDeleteAlias() {
    const richMenuAliasId = aliasForm.richMenuAliasId.trim()
    if (!richMenuAliasId) {
      setError('削除するエイリアスIDを入力してください')
      return
    }
    const ok = confirm(`エイリアス ${richMenuAliasId} を削除します。richmenuswitchの切替先に使っている場合は切替できなくなります。削除しますか？`)
    if (!ok) return
    setError('')
    setNotice('')
    try {
      const client = createLineHarnessClient(selectedAccountId)
      await client.richMenus.deleteAlias(richMenuAliasId)
      setNotice(`エイリアス ${richMenuAliasId} を削除しました`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'エイリアス削除に失敗しました')
    }
  }

  return (
    <div>
      <Header
        title="リッチメニュー管理"
        description={`自由なタップ領域とタブ切替を設定します${selectedAccount ? ` / ${selectedAccount.displayName || selectedAccount.name}` : ''}`}
        action={
          <button
            onClick={() => {
              if (!showCreate) resetCreateForm()
              setShowCreate((value) => !value)
            }}
            className="px-4 py-2 text-sm font-medium text-white rounded-lg transition-opacity hover:opacity-90"
            style={{ backgroundColor: '#06C755' }}
          >
            {showCreate ? '作成を閉じる' : '+ リッチメニュー作成'}
          </button>
        }
      />

      {error && <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">{error}</div>}
      {notice && <div className="mb-4 p-4 bg-green-50 border border-green-200 rounded-lg text-green-700 text-sm">{notice}</div>}

      <div className="mb-4 rounded-lg border border-blue-200 bg-blue-50 p-4 text-sm text-blue-800">
        安全制約: 作成だけでは友だちには表示されません。画像アップロード後、明示的に「デフォルト設定」を押した場合のみ反映します。タブ切替は2つ以上のリッチメニューを作り、エイリアスIDを `richmenuswitch` の切替先に指定します。
      </div>

      <section className="mb-6 bg-white rounded-lg border border-gray-200 p-5">
        <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-sm font-semibold text-gray-900">タブ切替エイリアス</h2>
            <p className="mt-1 text-xs text-gray-500">例: `main-tab` をメニューAに、`reserve-tab` をメニューBに紐づけ、各領域のアクションで切り替えます。</p>
          </div>
        </div>
        <div className="mt-4 grid grid-cols-1 gap-3 lg:grid-cols-[1fr_2fr_auto]">
          <input
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
            placeholder="richMenuAliasId 例: reserve-tab"
            value={aliasForm.richMenuAliasId}
            onChange={(e) => setAliasForm((prev) => ({ ...prev, richMenuAliasId: e.target.value }))}
          />
          <select
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white"
            value={aliasForm.richMenuId}
            onChange={(e) => setAliasForm((prev) => ({ ...prev, richMenuId: e.target.value }))}
          >
            <option value="">紐づけるリッチメニューを選択</option>
            {menus.map((menu) => (
              <option key={menu.richMenuId} value={menu.richMenuId}>{menu.name} / {menu.richMenuId}</option>
            ))}
          </select>
          <div className="flex gap-2">
            <button onClick={() => void handleSaveAlias()} className="rounded-lg bg-gray-900 px-3 py-2 text-sm font-medium text-white">保存</button>
            <button onClick={() => void handleDeleteAlias()} className="rounded-lg bg-red-50 px-3 py-2 text-sm font-medium text-red-600">削除</button>
          </div>
        </div>
        <div className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-[1fr_auto]">
          <select
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white"
            value={aliasForm.oldRichMenuId}
            onChange={(e) => setAliasForm((prev) => ({ ...prev, oldRichMenuId: e.target.value }))}
          >
            <option value="">差し替え後に削除する旧リッチメニューを選択</option>
            {menus.map((menu) => (
              <option key={menu.richMenuId} value={menu.richMenuId}>{menu.name} / {menu.richMenuId}</option>
            ))}
          </select>
          <button onClick={() => void handleReplaceAliasAndDeleteOld()} className="rounded-lg bg-red-600 px-3 py-2 text-sm font-medium text-white">
            差し替えて旧メニュー削除
          </button>
        </div>
      </section>

      {showCreate && (
        <section className="mb-6 bg-white rounded-lg border border-gray-200 p-6">
          <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-sm font-semibold text-gray-900">{editingMenu ? 'リッチメニューを編集して複製' : '新規リッチメニュー'}</h2>
              <p className="mt-1 text-xs text-gray-500">
                {editingMenu
                  ? '既存IDは直接変更せず、新しいリッチメニューとして作成します。成功後は新IDをデフォルト設定やエイリアス保存に使えます。'
                  : '画像を選んでから、画像上のタップ領域をドラッグして調整します。'}
              </p>
            </div>
            <span className="text-xs text-gray-500">{form.areas.length}/{MAX_AREAS} 領域</span>
          </div>
          {editingMenu && (
            <div className="mt-4 rounded-lg border border-blue-200 bg-blue-50 p-3 text-xs text-blue-800">
              編集元ID: <span className="font-mono">{editingMenu.richMenuId}</span>
              <br />
              保存後は新しいIDが発行されます。旧メニューは自動削除しません。
            </div>
          )}

          <div className="mt-4 grid grid-cols-1 lg:grid-cols-2 gap-4">
            <label className="block">
              <span className="block text-xs font-medium text-gray-600 mb-1">管理名</span>
              <input className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </label>
            <label className="block">
              <span className="block text-xs font-medium text-gray-600 mb-1">チャットバー表示</span>
              <input className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" value={form.chatBarText} onChange={(e) => setForm({ ...form, chatBarText: e.target.value })} />
            </label>
            <label className="block">
              <span className="block text-xs font-medium text-gray-600 mb-1">サイズ</span>
              <select className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white" value={form.size} onChange={(e) => setForm((prev) => ({ ...prev, layout: 'custom', size: e.target.value as SizePreset }))}>
                <option value="full">{sizeOptions.full.label}</option>
                <option value="half">{sizeOptions.half.label}</option>
              </select>
            </label>
            <label className="block">
              <span className="block text-xs font-medium text-gray-600 mb-1">レイアウト</span>
              <select className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white" value={form.layout} onChange={(e) => applyLayout(e.target.value as LayoutPreset)}>
                <option value="6">6分割プリセット</option>
                <option value="3">3分割プリセット</option>
                <option value="custom">カスタム</option>
              </select>
            </label>
          </div>

          <label className="mt-4 inline-flex items-center gap-2 text-sm text-gray-700">
            <input type="checkbox" checked={form.selected} onChange={(e) => setForm({ ...form, selected: e.target.checked })} />
            初期表示でメニューを開く
          </label>
          <label className="mt-3 inline-flex items-center gap-2 text-sm text-gray-700">
            <input type="checkbox" checked={form.setDefaultAfterCreate} onChange={(e) => setForm({ ...form, setDefaultAfterCreate: e.target.checked })} />
            作成成功後、この新しいリッチメニューをデフォルトに設定する
          </label>

          <div className="mt-5 rounded-lg border border-gray-200 bg-gray-50 p-4">
            <label className="block text-xs font-medium text-gray-600 mb-2">1. 画像アップロード PNG/JPEG 1MB以下</label>
            <input
              type="file"
              accept="image/png,image/jpeg"
              onChange={(e) => void handleDraftImage(e.target.files?.[0])}
              className="block w-full text-xs text-gray-500 file:mr-3 file:rounded-md file:border-0 file:bg-green-50 file:px-3 file:py-2 file:text-xs file:font-medium file:text-green-700"
            />
            {draftImage && (
              <p className="mt-2 text-xs text-gray-500">
                選択中: <span className="font-medium text-gray-700">{draftImage.file.name}</span>
              </p>
            )}
          </div>

          <div className="mt-5 grid grid-cols-1 gap-5 xl:grid-cols-[minmax(320px,420px)_1fr]">
            <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
              <div className="mb-3 flex items-center justify-between text-xs text-gray-500">
                <span>2. タップ領域プレビュー</span>
                <span>{size.width} x {size.height}</span>
              </div>
              <div
                className="relative overflow-hidden rounded-lg border border-gray-200 bg-white touch-none"
                style={{ aspectRatio: `${size.width} / ${size.height}` }}
                onPointerMove={handlePreviewPointerMove}
                onPointerUp={handlePreviewPointerUp}
                onPointerCancel={handlePreviewPointerUp}
              >
                {draftImage ? (
                  <img
                    src={draftImage.dataUrl}
                    alt="rich menu draft"
                    className="absolute inset-0 h-full w-full object-cover"
                    draggable={false}
                  />
                ) : (
                  <div className="absolute inset-0 flex items-center justify-center px-6 text-center text-xs text-gray-400">
                    先に画像を選択してください
                  </div>
                )}
                {form.areas.map((area, index) => (
                  <div
                    key={area.id}
                    className={`absolute flex cursor-move items-center justify-center border-2 text-[10px] font-semibold shadow-sm ${
                      selectedAreaId === area.id
                        ? 'border-blue-500 bg-blue-100/60 text-blue-950'
                        : 'border-green-500/80 bg-green-100/50 text-green-950'
                    }`}
                    style={{
                      left: `${(area.x / size.width) * 100}%`,
                      top: `${(area.y / size.height) * 100}%`,
                      width: `${(area.width / size.width) * 100}%`,
                      height: `${(area.height / size.height) * 100}%`,
                    }}
                    onPointerDown={(event) => handleAreaPointerDown(event, area, 'move')}
                  >
                    <span className="rounded bg-white/80 px-1">{index + 1}</span>
                    <span
                      className="absolute bottom-0 right-0 h-4 w-4 translate-x-1/2 translate-y-1/2 cursor-nwse-resize rounded-full border border-blue-600 bg-white"
                      onPointerDown={(event) => handleAreaPointerDown(event, area, 'resize')}
                    />
                  </div>
                ))}
              </div>
              {selectedArea && (
                <div className="mt-3 rounded-lg border border-gray-200 bg-white p-3 text-xs text-gray-600">
                  <div className="mb-2 flex items-center justify-between">
                    <span className="font-semibold text-gray-800">選択中: {selectedArea.label || 'ラベルなし'}</span>
                    <span className="text-gray-400">x:{selectedArea.x} y:{selectedArea.y}</span>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    {(['x', 'y', 'width', 'height'] as const).map((field) => (
                      <label key={field} className="block">
                        <span className="block text-[11px] font-medium text-gray-500 mb-1">{field}</span>
                        <input
                          type="number"
                          min={field === 'x' || field === 'y' ? 0 : 1}
                          className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-xs"
                          value={selectedArea[field]}
                          onChange={(e) => updateArea(selectedArea.id, { [field]: Number(e.target.value) } as Partial<AreaForm>)}
                        />
                      </label>
                    ))}
                  </div>
                </div>
              )}
              <button onClick={addArea} disabled={form.areas.length >= MAX_AREAS} className="mt-4 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 disabled:opacity-50">
                + タップ領域を追加
              </button>
            </div>

            <div className="space-y-3">
              {form.areas.map((area, index) => (
                <div key={area.id} className="rounded-lg border border-gray-200 p-4">
                  <div className="mb-3 flex items-center justify-between">
                    <button onClick={() => setSelectedAreaId(area.id)} className="text-left text-sm font-semibold text-gray-800">タップ領域 {index + 1}</button>
                    <button onClick={() => removeArea(area.id)} className="text-xs font-medium text-red-600 disabled:opacity-40" disabled={form.areas.length <= 1}>削除</button>
                  </div>

                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                    {(['x', 'y', 'width', 'height'] as const).map((field) => (
                      <label key={field} className="block">
                        <span className="block text-[11px] font-medium text-gray-500 mb-1">{field}</span>
                        <input
                          type="number"
                          min={field === 'x' || field === 'y' ? 0 : 1}
                          className="w-full border border-gray-300 rounded-lg px-2 py-2 text-sm"
                          value={area[field]}
                          onChange={(e) => updateArea(area.id, { [field]: Number(e.target.value) } as Partial<AreaForm>)}
                        />
                      </label>
                    ))}
                  </div>

                  <div className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-[1fr_180px]">
                    <input
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                      placeholder="ラベル"
                      value={area.label}
                      onChange={(e) => updateArea(area.id, { label: e.target.value })}
                    />
                    <select
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white"
                      value={area.type}
                      onChange={(e) => updateArea(area.id, { type: e.target.value as ActionType, value: '', displayText: '' })}
                    >
                      <option value="uri">URLを開く</option>
                      <option value="message">メッセージ送信</option>
                      <option value="postback">postback</option>
                      <option value="richmenuswitch">タブ切替</option>
                    </select>
                  </div>

                  <div className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-2">
                    <input
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                      placeholder={area.type === 'uri' ? 'https://...' : area.type === 'message' ? '送信するテキスト' : area.type === 'richmenuswitch' ? '切替先 aliasId 例: reserve-tab' : 'postback data 例: action=reserve'}
                      value={area.value}
                      onChange={(e) => updateArea(area.id, { value: e.target.value })}
                    />
                    <input
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                      placeholder={area.type === 'richmenuswitch' ? '切替data 例: switch-to-reserve' : area.type === 'postback' ? '表示テキスト 任意' : '任意補助値'}
                      value={area.displayText}
                      onChange={(e) => updateArea(area.id, { displayText: e.target.value })}
                      disabled={area.type === 'uri' || area.type === 'message'}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {validationError && (
            <div className="mt-4 rounded-lg bg-amber-50 border border-amber-200 p-3 text-xs text-amber-800">
              {validationError}
            </div>
          )}

          {createdRichMenuId && (
            <div className="mt-4 rounded-lg bg-gray-50 border border-gray-200 p-3 text-xs text-gray-700">
              作成済みID: <span className="font-mono">{createdRichMenuId}</span>
            </div>
          )}

          <div className="mt-5 flex gap-2">
            <button
              onClick={() => void handleCreate()}
              disabled={!canCreate || saving}
              className="px-4 py-2 text-sm font-medium text-white rounded-lg disabled:opacity-50"
              style={{ backgroundColor: '#06C755' }}
            >
              {saving ? '作成中...' : editingMenu ? '編集版を作成する' : '作成する'}
            </button>
            <button onClick={() => { setShowCreate(false); resetCreateForm() }} className="px-4 py-2 text-sm font-medium text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200">
              閉じる
            </button>
          </div>
        </section>
      )}

      {loading ? (
        <div className="bg-white rounded-lg border border-gray-200 p-8 text-center text-gray-400">読み込み中...</div>
      ) : menus.length === 0 ? (
        <div className="bg-white rounded-lg border border-gray-200 p-10 text-center text-gray-500">
          リッチメニューがありません。作成後、画像をアップロードしてください。
        </div>
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          {menus.map((menu) => (
            <article key={menu.richMenuId} className="bg-white rounded-lg border border-gray-200 p-5">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="text-sm font-bold text-gray-900 truncate">{menu.name}</h2>
                  <p className="text-xs text-gray-400 font-mono truncate">{menu.richMenuId}</p>
                </div>
                <span className="shrink-0 rounded-full bg-gray-100 px-2 py-1 text-xs text-gray-600">{formatSize(menu)}</span>
              </div>

              <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                <div className="rounded-lg bg-gray-50 p-3">
                  <p className="text-xs text-gray-400">チャットバー</p>
                  <p className="font-medium text-gray-800">{menu.chatBarText}</p>
                </div>
                <div className="rounded-lg bg-gray-50 p-3">
                  <p className="text-xs text-gray-400">領域数</p>
                  <p className="font-medium text-gray-800">{menu.areas.length}</p>
                </div>
              </div>

              <div className="mt-4 space-y-2">
                {menu.areas.map((area, index) => (
                  <div key={index} className="rounded-lg border border-gray-100 p-3 text-xs text-gray-600">
                    <div className="flex justify-between gap-2">
                      <span className="font-semibold text-gray-800">領域 {index + 1}</span>
                      <span>{area.action.type}</span>
                    </div>
                    <p className="mt-1 text-gray-400">x:{area.bounds.x} y:{area.bounds.y} w:{area.bounds.width} h:{area.bounds.height}</p>
                    <p className="mt-1 truncate">{actionSummary(area.action)}</p>
                  </div>
                ))}
              </div>

              <div className="mt-4 rounded-lg border border-dashed border-gray-300 p-3">
                <label className="block text-xs font-medium text-gray-600 mb-2">画像アップロード PNG/JPEG 1MB以下</label>
                {imagePreviews[menu.richMenuId] && (
                  <div className="mb-3 overflow-hidden rounded-lg border border-gray-200 bg-gray-50">
                    <img
                      src={imagePreviews[menu.richMenuId].url}
                      alt={`${menu.name} preview`}
                      className="h-auto w-full object-contain"
                    />
                    <div className="border-t border-gray-200 px-3 py-2 text-[11px] text-gray-500">
                      R2: <span className="font-mono">{imagePreviews[menu.richMenuId].key}</span>
                    </div>
                  </div>
                )}
                <input
                  type="file"
                  accept="image/png,image/jpeg"
                  disabled={uploadingId === menu.richMenuId}
                  onChange={(e) => void handleUpload(menu.richMenuId, e.target.files?.[0])}
                  className="block w-full text-xs text-gray-500 file:mr-3 file:rounded-md file:border-0 file:bg-green-50 file:px-3 file:py-2 file:text-xs file:font-medium file:text-green-700"
                />
                {uploadingId === menu.richMenuId && <p className="mt-2 text-xs text-gray-400">アップロード中...</p>}
              </div>

              <div className="mt-4 flex flex-wrap gap-2">
                <button onClick={() => void startEdit(menu)} className="px-3 py-2 text-xs font-medium text-gray-700 bg-blue-50 hover:bg-blue-100 rounded-lg">
                  編集して複製
                </button>
                <button onClick={() => void handleSetDefault(menu.richMenuId)} className="px-3 py-2 text-xs font-medium text-white rounded-lg" style={{ backgroundColor: '#06C755' }}>
                  デフォルト設定
                </button>
                <button onClick={() => setAliasForm((prev) => ({ ...prev, richMenuId: menu.richMenuId }))} className="px-3 py-2 text-xs font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg">
                  エイリアス対象にする
                </button>
                <button onClick={() => setAliasForm((prev) => ({ ...prev, oldRichMenuId: menu.richMenuId }))} className="px-3 py-2 text-xs font-medium text-red-700 bg-red-50 hover:bg-red-100 rounded-lg">
                  旧メニューに指定
                </button>
                <button onClick={() => void handleDelete(menu.richMenuId)} className="px-3 py-2 text-xs font-medium text-red-600 bg-red-50 hover:bg-red-100 rounded-lg">
                  削除
                </button>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  )
}
