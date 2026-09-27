const money = (amount: string) => ({ shopMoney: { amount, currencyCode: "USD" } });

/** A raw Admin GraphQL order node shaped like ORDERS_QUERY returns it. */
export function rawOrder(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: "gid://shopify/Order/1",
    name: "#1001",
    createdAt: "2026-03-02T15:00:00Z",
    processedAt: "2026-03-02T15:00:00Z",
    cancelledAt: null,
    test: false,
    currencyCode: "USD",
    sourceName: "web",
    tags: [],
    displayFinancialStatus: "PAID",
    displayFulfillmentStatus: "FULFILLED",
    customer: { id: "gid://shopify/Customer/9" },
    currentSubtotalPriceSet: money("100.00"),
    currentTotalPriceSet: money("110.00"),
    currentTotalDiscountsSet: money("0.00"),
    currentShippingPriceSet: money("8.00"),
    currentTotalTaxSet: money("2.00"),
    totalRefundedSet: money("0.00"),
    netPaymentSet: money("110.00"),
    refunds: [],
    fulfillments: [],
    ...overrides,
  };
}

export function rawLineItem(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: "gid://shopify/LineItem/1",
    name: "70% Cacao Dark Chocolate - 10-Pack",
    quantity: 1,
    currentQuantity: 1,
    sku: "ZAC-DC-70-10PK",
    product: { id: "gid://shopify/Product/10", title: "70% Cacao Dark Chocolate" },
    variant: { id: "gid://shopify/ProductVariant/100", title: "10-Pack", sku: "ZAC-DC-70-10PK" },
    originalUnitPriceSet: money("85.00"),
    discountedUnitPriceSet: money("85.00"),
    ...overrides,
  };
}
