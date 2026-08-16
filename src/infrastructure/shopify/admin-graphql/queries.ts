export const SHOP_QUERY = `
  query CurrentShop {
    shop { name currencyCode ianaTimezone plan { displayName } }
  }
`;

export const ACCESS_SCOPES_QUERY = `
  query CurrentAccessScopes {
    currentAppInstallation { accessScopes { handle } }
  }
`;

export const PRODUCTS_QUERY = `
  query CurrentProducts($first: Int!, $after: String) {
    products(first: $first, after: $after) {
      nodes {
        id title handle status
        variants(first: 25) {
          nodes {
            id title sku price inventoryQuantity sellableOnlineQuantity
            inventoryItem {
              id sku tracked unitCost { amount currencyCode }
              inventoryLevels(first: 10) {
                nodes {
                  id updatedAt
                  location { id name isActive }
                  quantities(names: ["available", "incoming", "committed", "damaged", "on_hand", "reserved", "safety_stock"]) { name quantity }
                }
              }
            }
          }
        }
      }
      pageInfo { hasNextPage endCursor }
    }
  }
`;

export const LOCATIONS_QUERY = `
  query CurrentLocations($first: Int!, $after: String) {
    locations(first: $first, after: $after, includeLegacy: true) {
      nodes { id name isActive }
      pageInfo { hasNextPage endCursor }
    }
  }
`;

export const ORDERS_QUERY = `
  query RecentOrders($first: Int!, $after: String) {
    orders(first: $first, after: $after, sortKey: CREATED_AT, reverse: true) {
      nodes {
        id name createdAt processedAt cancelledAt test currencyCode sourceName tags
        displayFinancialStatus displayFulfillmentStatus
        # Identity only — never a name, email or phone. Cohorts need a stable key
        # to group by, and every rendered output is an aggregate.
        customer { id }
        currentSubtotalPriceSet { shopMoney { amount currencyCode } }
        currentTotalPriceSet { shopMoney { amount currencyCode } }
        currentTotalDiscountsSet { shopMoney { amount currencyCode } }
        currentShippingPriceSet { shopMoney { amount currencyCode } }
        currentTotalTaxSet { shopMoney { amount currencyCode } }
        totalRefundedSet { shopMoney { amount currencyCode } }
        netPaymentSet { shopMoney { amount currencyCode } }
        lineItems(first: 100) {
          nodes {
            id name quantity currentQuantity refundableQuantity unfulfilledQuantity sku
            product { id title }
            variant { id title sku }
            originalUnitPriceSet { shopMoney { amount currencyCode } }
            discountedUnitPriceSet { shopMoney { amount currencyCode } }
          }
        }
        refunds {
          id createdAt totalRefundedSet { shopMoney { amount currencyCode } }
          refundLineItems(first: 100) {
            nodes { quantity subtotalSet { shopMoney { amount currencyCode } } lineItem { id sku } }
          }
        }
        fulfillments {
          id createdAt updatedAt status displayStatus deliveredAt inTransitAt estimatedDeliveryAt
          location { id name }
          trackingInfo(first: 10) { company number url }
        }
      }
      pageInfo { hasNextPage endCursor }
    }
  }
`;

export const CUSTOMERS_QUERY = `
  query RecentCustomers($first: Int!, $after: String) {
    customers(first: $first, after: $after, sortKey: UPDATED_AT, reverse: true) {
      nodes {
        id createdAt numberOfOrders amountSpent { amount currencyCode }
        lastOrder { id createdAt }
      }
      pageInfo { hasNextPage endCursor }
    }
  }
`;

export const ADMIN_READ_QUERIES = [
  SHOP_QUERY,
  ACCESS_SCOPES_QUERY,
  PRODUCTS_QUERY,
  LOCATIONS_QUERY,
  ORDERS_QUERY,
  CUSTOMERS_QUERY,
] as const;

export function assertReadOnlyGraphQl(document: string): void {
  if (/\bmutation\b/i.test(document) || /\bsubscription\b/i.test(document)) {
    throw new Error("Shopify adapter permits query operations only");
  }
  if (!/\bquery\b/.test(document)) {
    throw new Error("Shopify GraphQL document must declare a query operation");
  }
}
