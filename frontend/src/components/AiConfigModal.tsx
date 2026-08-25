import { useState, useEffect } from 'react'
import { Modal, Button, Badge } from '@/components/ui'
import { useAiConfig, DEFAULT_BASE_URL, DEFAULT_MODEL } from '@/features/aiConfig/store'
import { api } from '@/api/client'

interface AiConfigModalProps {
  open: boolean
  onClose: () => void
  required?: boolean
  inviteRequired?: boolean
}

/** 云端覆盖层与主树保持相同的 DeepSeek 系统配置门禁。 */
export function AiConfigModal({ open, onClose, required = false, inviteRequired = false }: AiConfigModalProps) {
  const { apiKey, baseUrl, model, accessCode, llmShared, setConfig } = useAiConfig()
  const [draftKey, setDraftKey] = useState(apiKey)
  const [draftUrl, setDraftUrl] = useState(baseUrl)
  const [draftModel, setDraftModel] = useState(model)
  const [draftAccessCode, setDraftAccessCode] = useState(accessCode)
  const [showKey, setShowKey] = useState(false)
  const [saved, setSaved] = useState(false)
  const [copied, setCopied] = useState(false)
  const [formError, setFormError] = useState('')
  const [verifying, setVerifying] = useState(false)

  const sharedEnabled = Boolean(llmShared?.enabled)
  const usingShared = sharedEnabled && !draftKey.trim()

  useEffect(() => {
    if (open) {
      setDraftKey(apiKey)
      setDraftUrl(DEFAULT_BASE_URL)
      setDraftModel(model)
      setDraftAccessCode(accessCode)
      setSaved(false)
      setFormError('')
    }
  }, [open, apiKey, baseUrl, model, accessCode])

  const handleSave = async () => {
    const apiKey = draftKey.trim()
    const modelName = draftModel.trim()
    const code = draftAccessCode.trim()
    if (!apiKey && !sharedEnabled) {
      setFormError('站点未开启共享额度，请输入你自己的 DeepSeek API Key。')
      return
    }
    if (apiKey && !modelName.startsWith('deepseek-')) {
      setFormError('模型名必须是 DeepSeek 模型，例如 deepseek-v4-pro。')
      return
    }
    if (inviteRequired && !code) {
      setFormError('开始使用前必须输入邀请码。')
      return
    }
    if (inviteRequired) {
      setVerifying(true)
      try {
        await api.verifyAccess(code)
      } catch (error) {
        setFormError(error instanceof Error ? error.message : '邀请码验证失败，请重试。')
        return
      } finally {
        setVerifying(false)
      }
    }
    setConfig({ apiKey, baseUrl: DEFAULT_BASE_URL, model: modelName, accessCode: code })
    setSaved(true)
    setTimeout(onClose, 800)
  }

  const handleCopyKey = () => {
    if (!draftKey.trim()) return
    navigator.clipboard.writeText(draftKey.trim())
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      dismissible={!required}
      title={required ? '⚙️ 首次系统配置（开始使用前必填）' : '⚙️ DeepSeek 系统配置'}
    >
      <p className="mb-4 text-sm text-slate-500">
        {sharedEnabled ? (
          <>
            联网课程默认使用<strong className="text-slate-700">站点共享额度</strong>，无需自己的 Key，按 IP 限流。
            <br />
            <span className="text-emerald-600">下方 Key 留空即可使用共享额度；填入自己的 Key 则无额度限制。</span>
          </>
        ) : (
          <>
            网站与联网课程会使用你自己的 Key 调用 DeepSeek。Key 只保存在当前浏览器，运行时临时传入沙箱，不保存到服务器。
          </>
        )}
      </p>

      {sharedEnabled && llmShared && (
        <div className="mb-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800">
          共享额度：模型 <code className="font-mono">{llmShared.sharedModel || 'deepseek-v4-flash'}</code>
          {llmShared.budgetPerIp ? (
            <>，每 IP 每小时 {Math.round(llmShared.budgetPerIp / 10000)} 万 token</>
          ) : null}
          ，单次运行 {llmShared.budgetPerRun ? Math.round(llmShared.budgetPerRun / 10000) : '—'} 万 token 上限。
        </div>
      )}

      <div className="mb-3">
        <div className="mb-1 flex items-center justify-between">
          <label className="panel-title">API Key（可选）</label>
          {draftKey.trim() && (
            <button
              onClick={handleCopyKey}
              className="rounded px-2 py-0.5 text-xs text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600"
            >
              {copied ? '已复制 ✓' : '复制'}
            </button>
          )}
        </div>
        <div className="relative">
          <input
            type={showKey ? 'text' : 'password'}
            value={draftKey}
            onChange={(e) => {
              setDraftKey(e.target.value)
              setFormError('')
            }}
            placeholder={sharedEnabled ? '留空 = 使用站点共享额度' : 'sk-...'}
            className="input w-full pr-16 font-mono"
            autoComplete="off"
            spellCheck={false}
          />
          <button
            onClick={() => setShowKey(!showKey)}
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded px-2 py-0.5 text-xs text-slate-400 hover:bg-slate-100 hover:text-slate-600"
          >
            {showKey ? '隐藏' : '显示'}
          </button>
        </div>
        {sharedEnabled && (
          <p className="mt-1 text-xs text-slate-400">
            共享额度按 IP 滑动窗口限流，超出后提示「繁忙 / 额度用尽」；自带 Key 则直连 DeepSeek 不受限。
          </p>
        )}
      </div>

      <div className="mb-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-500">
        接口地址固定为 <code className="font-mono text-brand-700">{draftUrl || DEFAULT_BASE_URL}</code>
      </div>

      <div className="mb-4">
        <label className="panel-title mb-1 block">模型名（仅自带 Key 时生效）</label>
        <input
          type="text"
          value={draftModel}
          onChange={(e) => {
            setDraftModel(e.target.value)
            setFormError('')
          }}
          placeholder={DEFAULT_MODEL}
          className="input w-full font-mono"
          spellCheck={false}
        />
        <p className="mt-1 text-xs text-slate-400">
          {usingShared
            ? '当前使用共享额度，模型由服务器统一指定。'
            : '使用你的 DeepSeek 账户当前可用模型，例如 deepseek-v4-pro。'}
        </p>
      </div>

      {inviteRequired && (
        <div className="mb-4">
          <label className="panel-title mb-1 block">邀请码（必填）</label>
          <input
            type="text"
            value={draftAccessCode}
            onChange={(e) => {
              setDraftAccessCode(e.target.value)
              setFormError('')
            }}
            placeholder="向管理员获取邀请码"
            className="input w-full font-mono"
            autoComplete="off"
            spellCheck={false}
          />
          <p className="mt-1 text-xs text-slate-400">
            当前云端服务器已启用邀请码；未通过验证不能运行课程。
          </p>
        </div>
      )}

      {formError && <p className="mb-3 text-sm text-red-600">{formError}</p>}

      <div className="flex items-center justify-between">
        <Badge color={usingShared ? 'green' : draftKey.trim() ? 'green' : 'amber'}>
          {usingShared
            ? '站点共享额度'
            : draftKey.trim()
              ? '自带 Key（无额度限制）'
              : sharedEnabled
                ? '共享额度（Key 留空）'
                : '必须填写 Key'}
        </Badge>
        <div className="flex gap-2">
          {!required && (
            <Button variant="secondary" onClick={onClose}>
              取消
            </Button>
          )}
          <Button onClick={() => void handleSave()} disabled={verifying}>
            {verifying ? '验证中...' : saved ? '已保存 ✓' : '保存'}
          </Button>
        </div>
      </div>
    </Modal>
  )
}
