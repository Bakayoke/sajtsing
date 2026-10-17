import { useState, type MouseEvent } from 'react'

const SWISH_MSISDN = '46730457930'
const SWISH_DISPLAY = '073-045 79 30'
const FIKA_MSG = 'Fika till Sajtsing'

function isMobileSwishDevice() {
  return /Android|iPhone|iPad|iPod/i.test(navigator.userAgent)
}

function swishHttpsUrl() {
  const params = new URLSearchParams({
    sw: SWISH_MSISDN,
    cur: 'SEK',
    msg: FIKA_MSG,
    edit: 'amt,msg',
  })
  return `https://app.swish.nu/1/p/sw/?${params.toString()}`
}

function swishAppUrl() {
  const data = encodeURIComponent(
    JSON.stringify({
      version: 1,
      payee: { value: SWISH_MSISDN },
      message: { value: FIKA_MSG, editable: true },
    }),
  )
  return `swish://payment?data=${data}`
}

function openSwish(e: MouseEvent<HTMLAnchorElement>) {
  e.preventDefault()
  const https = swishHttpsUrl()

  if (!isMobileSwishDevice()) {
    window.open(https, '_blank', 'noopener,noreferrer')
    return
  }

  const started = Date.now()
  window.location.href = swishAppUrl()
  window.setTimeout(() => {
    if (document.visibilityState !== 'visible') return
    if (Date.now() - started > 2000) return
    window.location.href = https
  }, 700)
}

export default function FikaTip() {
  const [copied, setCopied] = useState(false)
  const href = swishHttpsUrl()

  async function copyNumber() {
    try {
      await navigator.clipboard.writeText(SWISH_DISPLAY.replace(/[-\s]/g, ''))
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2000)
    } catch {
      /* ignore */
    }
  }

  return (
    <p className="fika-tip">
      <a className="fika-tip-link" href={href} onClick={openSwish}>
        Bjud mig på fika
      </a>
      <span className="fika-tip-sep"> · </span>
      <button type="button" className="fika-tip-copy" onClick={() => void copyNumber()}>
        {copied ? 'Kopierat!' : SWISH_DISPLAY}
      </button>
    </p>
  )
}
