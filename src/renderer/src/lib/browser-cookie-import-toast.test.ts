import { beforeEach, describe, expect, it, vi } from 'vitest'

const {
  clearBrowserProfileGoogleCookiesMock,
  confirmMock,
  dismissToastMock,
  errorToastMock,
  hasBrowserProfileGoogleCookiesMock,
  successToastMock,
  warningToastMock
} = vi.hoisted(() => ({
  clearBrowserProfileGoogleCookiesMock: vi.fn(),
  confirmMock: vi.fn(),
  dismissToastMock: vi.fn(),
  errorToastMock: vi.fn(),
  hasBrowserProfileGoogleCookiesMock: vi.fn(),
  successToastMock: vi.fn(),
  warningToastMock: vi.fn()
}))

vi.mock('@/store', () => ({
  useAppStore: {
    getState: () => ({
      clearBrowserProfileGoogleCookies: clearBrowserProfileGoogleCookiesMock,
      hasBrowserProfileGoogleCookies: hasBrowserProfileGoogleCookiesMock
    })
  }
}))

vi.mock('sonner', () => ({
  toast: {
    dismiss: dismissToastMock,
    error: errorToastMock,
    success: successToastMock,
    warning: warningToastMock
  }
}))

// Why: sonner deletes the toast after the action's onClick unless it preventDefaults.
function clickToastAction(): { preventDefault: ReturnType<typeof vi.fn> } {
  const event = { preventDefault: vi.fn() }
  warningToastMock.mock.calls[0]?.[1].action.onClick(event)
  return event
}

// Why: the decline path is silent, so "nothing happened" needs the promise chain drained first.
function flushPendingWork(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0))
}

import type { BrowserCookieImportSummary } from '../../../shared/browser-workspace-types'
import { emitBrowserCookieImportToast } from './browser-cookie-import-toast'

const summary: BrowserCookieImportSummary = {
  totalCookies: 3,
  importedCookies: 3,
  skippedCookies: 0,
  domains: ['example.com']
}

const localTarget = {
  profileId: 'default',
  executionHostId: 'local' as const,
  executionHostLabel: 'Local Mac',
  confirm: confirmMock
}

const remoteTarget = {
  profileId: 'default',
  executionHostId: 'runtime:remote-mac' as const,
  executionHostLabel: 'Remote Mac',
  confirm: confirmMock
}

const windowsTarget = {
  profileId: 'default',
  executionHostId: 'local' as const,
  executionHostLabel: 'Local Windows',
  confirm: confirmMock
}

describe('emitBrowserCookieImportToast', () => {
  beforeEach(() => {
    clearBrowserProfileGoogleCookiesMock.mockReset().mockResolvedValue(true)
    confirmMock.mockReset().mockResolvedValue(true)
    dismissToastMock.mockReset()
    errorToastMock.mockReset()
    hasBrowserProfileGoogleCookiesMock.mockReset().mockResolvedValue(true)
    successToastMock.mockReset()
    warningToastMock.mockReset().mockReturnValue('google-cookie-toast')
  })

  it('shows the localized total-failure warning', () => {
    emitBrowserCookieImportToast(
      {
        ...summary,
        warning: {
          code: 'restart-fallback-unavailable',
          loadedCookies: 0,
          failedCookies: 3
        }
      },
      'Imported 3 cookies.',
      localTarget
    )

    expect(warningToastMock).toHaveBeenCalledWith(
      'None of the 3 cookies could be loaded, and the restart fallback was unavailable. The previous cookies for this profile were replaced. Try the import again.'
    )
    expect(successToastMock).not.toHaveBeenCalled()
  })

  it('shows success when the import has no warning', () => {
    emitBrowserCookieImportToast(summary, 'Imported 3 cookies.', localTarget)

    expect(successToastMock).toHaveBeenCalledWith('Imported 3 cookies.')
    expect(warningToastMock).not.toHaveBeenCalled()
  })

  it('offers the in-app file import without recommending an exporter', () => {
    emitBrowserCookieImportToast(
      {
        ...summary,
        warning: {
          code: 'cookies-undecryptable',
          failedCookies: 3,
          reason: 'app-bound-encryption'
        }
      },
      'Imported 0 cookies.',
      windowsTarget
    )

    const message = warningToastMock.mock.calls[0]?.[0]
    expect(message).toBe(
      "Orca cannot decrypt 3 of this browser's cookies because they use app-bound encryption. You can import cookies from a file using “From File…”."
    )
    expect(message).not.toContain('export')
  })

  it('shows the recovery action when the target profile contains Google cookies', async () => {
    emitBrowserCookieImportToast(
      { ...summary, importedCookies: 2, skippedCookies: 1, googleCookiesSkipped: 1 },
      'Imported 2 cookies.',
      remoteTarget
    )

    expect(successToastMock).toHaveBeenCalledWith('Imported 2 cookies.')
    await vi.waitFor(() =>
      expect(warningToastMock).toHaveBeenCalledWith(
        'Google cookies were not imported. If Google sign-in is not working in this profile, clear its Google cookies, then sign in directly in Orca on Remote Mac.',
        {
          duration: 12000,
          action: { label: 'Clear Google cookies', onClick: expect.any(Function) }
        }
      )
    )
    expect(hasBrowserProfileGoogleCookiesMock).toHaveBeenCalledWith('default', 'runtime:remote-mac')
    expect(successToastMock.mock.invocationCallOrder[0]).toBeLessThan(
      warningToastMock.mock.invocationCallOrder[0]
    )
  })

  it('does not infer a Google warning from generic skipped cookies', () => {
    emitBrowserCookieImportToast(
      { ...summary, importedCookies: 2, skippedCookies: 1 },
      'Imported 2 cookies.',
      localTarget
    )

    expect(successToastMock).toHaveBeenCalledWith('Imported 2 cookies.')
    expect(warningToastMock).not.toHaveBeenCalled()
  })

  it('keeps both applicable warnings when restart fallback is unavailable', async () => {
    emitBrowserCookieImportToast(
      {
        ...summary,
        importedCookies: 1,
        skippedCookies: 2,
        googleCookiesSkipped: 1,
        warning: {
          code: 'restart-fallback-unavailable',
          loadedCookies: 1,
          failedCookies: 1
        }
      },
      'Imported 1 cookie.',
      remoteTarget
    )

    expect(successToastMock).not.toHaveBeenCalled()
    await vi.waitFor(() => expect(warningToastMock).toHaveBeenCalledTimes(2))
    expect(warningToastMock.mock.calls).toEqual([
      [
        'Imported 1 of 2 cookies. The rest could not be loaded, and the restart fallback was unavailable. Try the import again.'
      ],
      [
        'Google cookies were not imported. If Google sign-in is not working in this profile, clear its Google cookies, then sign in directly in Orca on Remote Mac.',
        {
          duration: 12000,
          action: { label: 'Clear Google cookies', onClick: expect.any(Function) }
        }
      ]
    ])
  })

  it('clears Google cookies from the imported profile on its execution host', async () => {
    emitBrowserCookieImportToast(
      { ...summary, googleCookiesSkipped: 1 },
      'Imported 3 cookies.',
      remoteTarget
    )

    await vi.waitFor(() => expect(warningToastMock).toHaveBeenCalledOnce())
    const event = clickToastAction()
    expect(event.preventDefault).toHaveBeenCalledOnce()

    await vi.waitFor(() =>
      expect(confirmMock).toHaveBeenCalledWith({
        title: 'Clear Google cookies?',
        description:
          'This signs you out of Google in this browser profile on Remote Mac. Cookies for other sites are kept.',
        confirmLabel: 'Clear Google cookies',
        confirmVariant: 'destructive'
      })
    )
    await vi.waitFor(() =>
      expect(clearBrowserProfileGoogleCookiesMock).toHaveBeenCalledWith(
        'default',
        'runtime:remote-mac'
      )
    )
    expect(successToastMock).toHaveBeenLastCalledWith('Google cookies cleared.')
    expect(errorToastMock).not.toHaveBeenCalled()
    expect(dismissToastMock).toHaveBeenCalledWith('google-cookie-toast')
  })

  it('keeps Google cookies and the recovery toast when the user cancels the confirmation', async () => {
    confirmMock.mockResolvedValue(false)
    emitBrowserCookieImportToast(
      { ...summary, googleCookiesSkipped: 1 },
      'Imported 3 cookies.',
      remoteTarget
    )

    await vi.waitFor(() => expect(warningToastMock).toHaveBeenCalledOnce())
    const event = clickToastAction()
    expect(event.preventDefault).toHaveBeenCalledOnce()

    await vi.waitFor(() => expect(confirmMock).toHaveBeenCalledOnce())
    await flushPendingWork()
    expect(clearBrowserProfileGoogleCookiesMock).not.toHaveBeenCalled()
    expect(dismissToastMock).not.toHaveBeenCalled()
  })

  it('does not offer the action when the target profile has no Google cookies', async () => {
    hasBrowserProfileGoogleCookiesMock.mockResolvedValue(false)
    emitBrowserCookieImportToast(
      { ...summary, googleCookiesSkipped: 1 },
      'Imported 3 cookies.',
      remoteTarget
    )
    await vi.waitFor(() =>
      expect(warningToastMock).toHaveBeenLastCalledWith(
        'Google cookies were not imported. Sign in directly in Orca on Remote Mac.',
        { duration: 12000 }
      )
    )
  })

  it('reports when profile cookies could not be cleared', async () => {
    clearBrowserProfileGoogleCookiesMock.mockResolvedValue(false)
    emitBrowserCookieImportToast(
      { ...summary, googleCookiesSkipped: 1 },
      'Imported 3 cookies.',
      remoteTarget
    )

    await vi.waitFor(() => expect(warningToastMock).toHaveBeenCalledOnce())
    clickToastAction()

    await vi.waitFor(() =>
      expect(errorToastMock).toHaveBeenCalledWith('Failed to clear Google cookies.')
    )
  })
})
