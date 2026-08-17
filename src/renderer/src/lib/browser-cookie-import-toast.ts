import { toast } from 'sonner'
import type { BrowserCookieImportSummary } from '../../../shared/browser-workspace-types'
import type { ExecutionHostId } from '../../../shared/execution-host'
import type { ConfirmationDialogContextValue } from '@/components/confirmation-dialog-context'
import { translate } from '@/i18n/i18n'
import { useAppStore } from '@/store'

type CookieImportWarning = NonNullable<BrowserCookieImportSummary['warning']>

type CookieImportToastTarget = {
  profileId: string
  executionHostId: ExecutionHostId
  executionHostLabel: string
  confirm: ConfirmationDialogContextValue
}

function formatCookieImportWarning(warning: CookieImportWarning): string {
  switch (warning.code) {
    case 'restart-fallback-unavailable':
      return warning.loadedCookies === 0
        ? translate(
            'auto.lib.browser.cookie.import.toast.restartFallbackUnavailableNone',
            'None of the {{value0}} cookies could be loaded, and the restart fallback was unavailable. The previous cookies for this profile were replaced. Try the import again.',
            { value0: warning.failedCookies }
          )
        : translate(
            'auto.lib.browser.cookie.import.toast.restartFallbackUnavailablePartial',
            'Imported {{value0}} of {{value1}} cookies. The rest could not be loaded, and the restart fallback was unavailable. Try the import again.',
            {
              value0: warning.loadedCookies,
              value1: warning.loadedCookies + warning.failedCookies
            }
          )
    case 'cookies-undecryptable':
      switch (warning.reason) {
        case 'app-bound-encryption':
          return warning.otherFailedCookies
            ? translate(
                'auto.lib.browser.cookie.import.toast.undecryptableAppBoundMixed',
                "Orca cannot decrypt {{value0}} of this browser's cookies because they use app-bound encryption; {{value1}} more could not be decrypted for another reason. You can import cookies from a file using “From File…”.",
                { value0: warning.failedCookies, value1: warning.otherFailedCookies }
              )
            : translate(
                'auto.lib.browser.cookie.import.toast.undecryptableAppBound',
                "Orca cannot decrypt {{value0}} of this browser's cookies because they use app-bound encryption. You can import cookies from a file using “From File…”.",
                { value0: warning.failedCookies }
              )
        case 'linux-keyring-unavailable':
          return warning.otherFailedCookies
            ? translate(
                'auto.lib.browser.cookie.import.toast.undecryptableKeyringMixed',
                '{{value0}} cookies could not be decrypted because the system keyring was unavailable; {{value1}} more could not be decrypted for another reason. Unlock your login keyring (or install a Secret Service provider such as gnome-keyring) and import again.',
                { value0: warning.failedCookies, value1: warning.otherFailedCookies }
              )
            : translate(
                'auto.lib.browser.cookie.import.toast.undecryptableKeyring',
                '{{value0}} cookies could not be decrypted because the system keyring was unavailable. Unlock your login keyring (or install a Secret Service provider such as gnome-keyring) and import again.',
                { value0: warning.failedCookies }
              )
        case 'unknown':
          return translate(
            'auto.lib.browser.cookie.import.toast.undecryptableUnknown',
            '{{value0}} cookies could not be decrypted and were skipped. Close the source browser completely and try the import again.',
            { value0: warning.failedCookies }
          )
      }
  }
}

async function emitGoogleCookieImportWarning(
  summary: BrowserCookieImportSummary,
  target: CookieImportToastTarget
): Promise<void> {
  if (!summary.googleCookiesSkipped) {
    return
  }
  const hasGoogleCookies = await useAppStore
    .getState()
    .hasBrowserProfileGoogleCookies(target.profileId, target.executionHostId)
  const clearGoogleCookiesLabel = translate(
    'auto.lib.browser.cookie.import.toast.clearGoogleCookies',
    'Clear Google cookies'
  )
  const clearAction = hasGoogleCookies
    ? {
        action: {
          label: clearGoogleCookiesLabel,
          onClick: () => {
            void target
              .confirm({
                title: translate(
                  'auto.lib.browser.cookie.import.toast.googleCookiesClearConfirmTitle',
                  'Clear Google cookies?'
                ),
                description: translate(
                  'auto.lib.browser.cookie.import.toast.googleCookiesClearConfirmDescription',
                  'This signs you out of Google in this browser profile on {{value0}}. Cookies for other sites are kept.',
                  { value0: target.executionHostLabel }
                ),
                confirmLabel: clearGoogleCookiesLabel,
                confirmVariant: 'destructive'
              })
              .then((confirmed) => {
                if (!confirmed) {
                  return
                }
                return useAppStore
                  .getState()
                  .clearBrowserProfileGoogleCookies(target.profileId, target.executionHostId)
                  .then((cleared) => {
                    if (cleared) {
                      toast.success(
                        translate(
                          'auto.lib.browser.cookie.import.toast.googleCookiesCleared',
                          'Google cookies cleared.'
                        )
                      )
                    } else {
                      toast.error(
                        translate(
                          'auto.lib.browser.cookie.import.toast.googleCookiesClearFailed',
                          'Failed to clear Google cookies.'
                        )
                      )
                    }
                  })
              })
          }
        }
      }
    : {}
  toast.warning(
    hasGoogleCookies
      ? translate(
          'auto.lib.browser.cookie.import.toast.googleCookiesRecovery',
          'Google cookies were not imported. If Google sign-in is not working in this profile, clear its Google cookies, then sign in directly in Orca on {{value0}}.',
          { value0: target.executionHostLabel }
        )
      : translate(
          'auto.lib.browser.cookie.import.toast.googleCookiesSkipped',
          'Google cookies were not imported. Sign in directly in Orca on {{value0}}.',
          { value0: target.executionHostLabel }
        ),
    { duration: 12000, ...clearAction }
  )
}

// Why: a degraded import returns ok:true with a warning, so every call site must route it to a
// warning toast instead of reporting an unqualified success (#9355).
export function emitBrowserCookieImportToast(
  summary: BrowserCookieImportSummary,
  successMessage: string,
  target: CookieImportToastTarget
): void {
  const warning = summary.warning
  if (warning) {
    toast.warning(formatCookieImportWarning(warning))
  } else {
    toast.success(successMessage)
  }
  void emitGoogleCookieImportWarning(summary, target)
}
