import { NativeModule, requireNativeModule } from 'expo'
import { isIos } from '@/lib/utils'

export interface NoraBillingProduct {
  id: string
  title: string
  description: string
  displayPrice: string
}

export interface NoraBillingEntitlement {
  transactionId: string
  originalTransactionId: string
  productId: string
  purchaseDate: string
  expirationDate: string | null
  revocationDate: string | null
  appAccountToken: string | null
  environment: string | null
  signedTransactionInfo: string
}

declare class NoraBillingModule extends NativeModule {
  getProducts(productIds: string[]): Promise<NoraBillingProduct[]>
  purchase(productId: string, appAccountToken: string): Promise<NoraBillingEntitlement>
  restore(): Promise<NoraBillingEntitlement[]>
  getCurrentEntitlements(): Promise<NoraBillingEntitlement[]>
  manageSubscriptions(): Promise<void>
}

const unsupportedError = () => Promise.reject(new Error('In-app purchases are only available on iOS'))

const NoraBilling = isIos
  ? requireNativeModule<NoraBillingModule>('NoraBilling')
  : ({
      getProducts: unsupportedError,
      purchase: unsupportedError,
      restore: unsupportedError,
      getCurrentEntitlements: unsupportedError,
      manageSubscriptions: unsupportedError,
    } as unknown as NoraBillingModule)

export default NoraBilling
