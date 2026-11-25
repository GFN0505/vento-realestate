import 'react'

declare module 'react' {
  interface InputHTMLAttributes<T> {
    /** Safari / iCloud Keychain: generate passwords that meet these rules. */
    passwordrules?: string
  }
}
