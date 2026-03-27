# Apex CRM Comprehensive API Routing Report

This report automatically extracts all active endpoints from the backend source routing definitions, alongside their HTTP Methods and URL path parameters.

## /api/v1/auth Routes
*Source Location: /src/routes\v1\auth.routes.js*

| Method | Endpoint Path | URL Parameters & Route Handler |
|--------|---------------|----------------------------------|
| **POST** | `/api/v1/auth/signup` | *(No URL parameters)* <br/> Handler: `authController.signup` |
| **POST** | `/api/v1/auth/login` | *(No URL parameters)* <br/> Handler: `authController.login` |
| **POST** | `/api/v1/auth/refresh-token` | *(No URL parameters)* <br/> Handler: `authController.refreshToken` |
| **POST** | `/api/v1/auth/forgotPassword` | *(No URL parameters)* <br/> Handler: `authController.forgotPassword` |
| **PATCH** | `/api/v1/auth/resetPassword/:token` | **URL Params:** `token` <br/> Handler: `authController.resetPassword` |
| **GET** | `/api/v1/auth/verify-token` | *(No URL parameters)* <br/> Handler: `authController.verifyToken` |
| **GET** | `/api/v1/auth/verify-email/:token` | **URL Params:** `token` <br/> Handler: `authController.verifyEmail` |
| **PATCH** | `/api/v1/auth/updateMyPassword` | *(No URL parameters)* <br/> Handler: `authController.updateMyPassword` |
| **POST** | `/api/v1/auth/send-verification-email` | *(No URL parameters)* <br/> Handler: `authController.sendVerificationEmail` |
| **POST** | `/api/v1/auth/logout` | *(No URL parameters)* <br/> Handler: `authController.logout` |
| **POST** | `/api/v1/auth/logout-all` | *(No URL parameters)* <br/> Handler: `authController.logoutAll` |
| **GET** | `/api/v1/auth/sessions` | *(No URL parameters)* <br/> Handler: `Unknown Controller Method` |
| **DELETE** | `/api/v1/auth/sessions/:sessionId` | **URL Params:** `sessionId` <br/> Handler: `Unknown Controller Method` |

## /api/v1/users Routes
*Source Location: /src/routes\v1\user.routes.js*

| Method | Endpoint Path | URL Parameters & Route Handler |
|--------|---------------|----------------------------------|
| **GET** | `/api/v1/users/me` | *(No URL parameters)* <br/> Handler: `userController.getMyProfile` |
| **PATCH** | `/api/v1/users/me` | *(No URL parameters)* <br/> Handler: `userController.updateMyProfile` |
| **PATCH** | `/api/v1/users/me/photo` | *(No URL parameters)* <br/> Handler: `userController.uploadProfilePhoto` |
| **PATCH** | `/api/v1/users/updateMyPassword` | *(No URL parameters)* <br/> Handler: `authController.updateMyPassword` |
| **GET** | `/api/v1/users/me/permissions` | *(No URL parameters)* <br/> Handler: `userController.getMyPermissions` |
| **GET** | `/api/v1/users/me/devices` | *(No URL parameters)* <br/> Handler: `userController.getMyDevices` |
| **DELETE** | `/api/v1/users/me/devices/:sessionId` | **URL Params:** `sessionId` <br/> Handler: `userController.revokeDevice` |
| **POST** | `/api/v1/users/check-permission` | *(No URL parameters)* <br/> Handler: `userController.checkPermission` |
| **GET** | `/api/v1/users/all-permissions` | *(No URL parameters)* <br/> Handler: `userController.getAllAvailablePermissions` |
| **GET** | `/api/v1/users` | *(No URL parameters)* <br/> Handler: `userController.getAllUsers` |
| **GET** | `/api/v1/users/search` | *(No URL parameters)* <br/> Handler: `userController.searchUsers` |
| **GET** | `/api/v1/users/hierarchy` | *(No URL parameters)* <br/> Handler: `userController.getOrgHierarchy` |
| **GET** | `/api/v1/users/export` | *(No URL parameters)* <br/> Handler: `userController.exportUsers` |
| **GET** | `/api/v1/users/by-department/:departmentId` | **URL Params:** `departmentId` <br/> Handler: `userController.getUsersByDepartment` |
| **GET** | `/api/v1/users/:id` | **URL Params:** `id` <br/> Handler: `userController.getUser` |
| **GET** | `/api/v1/users/:id/activity` | **URL Params:** `id` <br/> Handler: `userController.getUserActivity` |
| **POST** | `/api/v1/users` | *(No URL parameters)* <br/> Handler: `userController.createUser` |
| **PATCH** | `/api/v1/users/:id` | **URL Params:** `id` <br/> Handler: `userController.updateUser` |
| **DELETE** | `/api/v1/users/:id` | **URL Params:** `id` <br/> Handler: `userController.deleteUser` |
| **PATCH** | `/api/v1/users/:id/photo` | **URL Params:** `id` <br/> Handler: `userController.uploadUserPhotoByAdmin` |
| **PATCH** | `/api/v1/users/:id/password` | **URL Params:** `id` <br/> Handler: `userController.adminUpdatePassword` |
| **PATCH** | `/api/v1/users/:id/activate` | **URL Params:** `id` <br/> Handler: `userController.activateUser` |
| **PATCH** | `/api/v1/users/:id/deactivate` | **URL Params:** `id` <br/> Handler: `userController.deactivateUser` |
| **POST** | `/api/v1/users/toggle-block` | *(No URL parameters)* <br/> Handler: `userController.toggleUserBlock` |
| **POST** | `/api/v1/users/bulk-status` | *(No URL parameters)* <br/> Handler: `userController.bulkUpdateStatus` |

## /api/v1/roles Routes
*Source Location: /src/routes\v1\roles.routes.js*

| Method | Endpoint Path | URL Parameters & Route Handler |
|--------|---------------|----------------------------------|
| **GET** | `/api/v1/roles/permissions` | *(No URL parameters)* <br/> Handler: `roleController.getAvailablePermissions` |
| **POST** | `/api/v1/roles/assign` | *(No URL parameters)* <br/> Handler: `roleController.assignRoleToUser` |
| **GET** | `/api/v1/roles` | *(No URL parameters)* <br/> Handler: `Unknown Controller Method` |
| **POST** | `/api/v1/roles` | *(No URL parameters)* <br/> Handler: `roleController.createRole` |
| **GET** | `/api/v1/roles/:id` | **URL Params:** `id` <br/> Handler: `Unknown Controller Method` |
| **PATCH** | `/api/v1/roles/:id` | **URL Params:** `id` <br/> Handler: `roleController.updateRole` |
| **DELETE** | `/api/v1/roles/:id` | **URL Params:** `id` <br/> Handler: `Unknown Controller Method` |
| **GET** | `/api/v1/roles` | *(No URL parameters)* <br/> Handler: `Unknown Controller Method` |
| **POST** | `/api/v1/roles` | *(No URL parameters)* <br/> Handler: `roleController.createRole` |
| **GET** | `/api/v1/roles/:id` | **URL Params:** `id` <br/> Handler: `Unknown Controller Method` |
| **PATCH** | `/api/v1/roles/:id` | **URL Params:** `id` <br/> Handler: `roleController.updateRole` |
| **DELETE** | `/api/v1/roles/:id` | **URL Params:** `id` <br/> Handler: `Unknown Controller Method` |

## /api/v1/sessions Routes
*Source Location: /src/routes\v1\session.routes.js*

| Method | Endpoint Path | URL Parameters & Route Handler |
|--------|---------------|----------------------------------|
| **GET** | `/api/v1/sessions/me` | *(No URL parameters)* <br/> Handler: `sessionController.mySessions` |
| **GET** | `/api/v1/sessions` | *(No URL parameters)* <br/> Handler: `sessionController.listSessions` |
| **DELETE** | `/api/v1/sessions/bulk-delete` | *(No URL parameters)* <br/> Handler: `sessionController.bulkDeleteSessions` |
| **DELETE** | `/api/v1/sessions/:id` | **URL Params:** `id` <br/> Handler: `sessionController.deleteSession` |
| **PATCH** | `/api/v1/sessions/:id/revoke` | **URL Params:** `id` <br/> Handler: `sessionController.revokeSession` |
| **PATCH** | `/api/v1/sessions/revoke-all` | *(No URL parameters)* <br/> Handler: `sessionController.revokeAllOthers` |

## /api/v1/accounts Routes
*Source Location: /src/routes\v1\account.routes.js*

| Method | Endpoint Path | URL Parameters & Route Handler |
|--------|---------------|----------------------------------|
| **GET** | `/api/v1/accounts/hierarchy` | *(No URL parameters)* <br/> Handler: `accountController.getHierarchy` |
| **PUT** | `/api/v1/accounts/:id/reparent` | **URL Params:** `id` <br/> Handler: `accountController.reparentAccount` |
| **GET** | `/api/v1/accounts` | *(No URL parameters)* <br/> Handler: `Unknown Controller Method` |
| **POST** | `/api/v1/accounts` | *(No URL parameters)* <br/> Handler: `accountController.createAccount` |
| **GET** | `/api/v1/accounts/:id` | **URL Params:** `id` <br/> Handler: `Unknown Controller Method` |
| **PUT** | `/api/v1/accounts/:id` | **URL Params:** `id` <br/> Handler: `accountController.updateAccount` |
| **DELETE** | `/api/v1/accounts/:id` | **URL Params:** `id` <br/> Handler: `Unknown Controller Method` |

## /api/v1/invoices Routes
*Source Location: /src/routes\v1\invoice.routes.js*

| Method | Endpoint Path | URL Parameters & Route Handler |
|--------|---------------|----------------------------------|
| **GET** | `/api/v1/invoices/invoiceanalytics/profit-summary` | *(No URL parameters)* <br/> Handler: `invoiceProfitController.profitSummary` |
| **GET** | `/api/v1/invoices/invoiceanalytics/profit` | *(No URL parameters)* <br/> Handler: `invoiceProfitController.getProfitAnalysis` |
| **GET** | `/api/v1/invoices/invoiceanalytics/advanced-profit` | *(No URL parameters)* <br/> Handler: `invoiceProfitController.getAdvancedProfitAnalysis` |
| **GET** | `/api/v1/invoices/invoiceanalytics/profit-dashboard` | *(No URL parameters)* <br/> Handler: `invoiceProfitController.getProfitDashboard` |
| **GET** | `/api/v1/invoices/invoiceanalytics/export-profit` | *(No URL parameters)* <br/> Handler: `invoiceProfitController.exportProfitData` |
| **GET** | `/api/v1/invoices/invoiceanalytics/product-profit/:productId` | **URL Params:** `productId` <br/> Handler: `invoiceProfitController.getProductProfitAnalysis` |
| **GET** | `/api/v1/invoices/reports/profit` | *(No URL parameters)* <br/> Handler: `invoiceProfitController.profitSummary` |
| **POST** | `/api/v1/invoices/check-stock` | *(No URL parameters)* <br/> Handler: `invoiceController.checkStock` |
| **PATCH** | `/api/v1/invoices/bulk/status` | *(No URL parameters)* <br/> Handler: `invoiceController.bulkUpdateStatus` |
| **POST** | `/api/v1/invoices/bulk/cancel` | *(No URL parameters)* <br/> Handler: `invoiceController.bulkCancelInvoices` |
| **GET** | `/api/v1/invoices/validate/number/:number` | **URL Params:** `number` <br/> Handler: `invoiceController.validateNumber` |
| **GET** | `/api/v1/invoices/export/all` | *(No URL parameters)* <br/> Handler: `invoiceController.exportInvoices` |
| **GET** | `/api/v1/invoices/search/:query` | **URL Params:** `query` <br/> Handler: `invoiceController.searchInvoices` |
| **GET** | `/api/v1/invoices/drafts/all` | *(No URL parameters)* <br/> Handler: `invoiceController.getAllDrafts` |
| **GET** | `/api/v1/invoices/trash/all` | *(No URL parameters)* <br/> Handler: `invoiceController.getDeletedInvoices` |
| **GET** | `/api/v1/invoices/customer/:customerId` | **URL Params:** `customerId` <br/> Handler: `invoiceController.getInvoicesByCustomer` |
| **GET** | `/api/v1/invoices/:id/stock-info` | **URL Params:** `id` <br/> Handler: `invoiceController.getInvoiceWithStock` |
| **GET** | `/api/v1/invoices/:id/low-stock` | **URL Params:** `id` <br/> Handler: `invoiceController.getLowStockWarnings` |
| **POST** | `/api/v1/invoices/:id/cancel` | **URL Params:** `id` <br/> Handler: `invoiceController.cancelInvoice` |
| **POST** | `/api/v1/invoices/:id/convert` | **URL Params:** `id` <br/> Handler: `invoiceController.convertDraftToActive` |
| **GET** | `/api/v1/invoices/:id/history` | **URL Params:** `id` <br/> Handler: `invoiceController.getInvoiceHistory` |
| **GET** | `/api/v1/invoices/:id/download` | **URL Params:** `id` <br/> Handler: `invoicePDFController.downloadInvoicePDF` |
| **POST** | `/api/v1/invoices/:id/email` | **URL Params:** `id` <br/> Handler: `invoiceController.sendInvoiceEmail` |
| **POST** | `/api/v1/invoices/:id/restore` | **URL Params:** `id` <br/> Handler: `invoiceController.restoreInvoice` |
| **GET** | `/api/v1/invoices/invoiceanalytics/profit-summary` | *(No URL parameters)* <br/> Handler: `invoiceProfitController.profitSummary` |
| **GET** | `/api/v1/invoices/invoiceanalytics/profit` | *(No URL parameters)* <br/> Handler: `invoiceProfitController.getProfitAnalysis` |
| **GET** | `/api/v1/invoices/invoiceanalytics/advanced-profit` | *(No URL parameters)* <br/> Handler: `invoiceProfitController.getAdvancedProfitAnalysis` |
| **GET** | `/api/v1/invoices/invoiceanalytics/profit-dashboard` | *(No URL parameters)* <br/> Handler: `invoiceProfitController.getProfitDashboard` |
| **GET** | `/api/v1/invoices/invoiceanalytics/export-profit` | *(No URL parameters)* <br/> Handler: `invoiceProfitController.exportProfitData` |
| **GET** | `/api/v1/invoices/invoiceanalytics/product-profit/:productId` | **URL Params:** `productId` <br/> Handler: `invoiceProfitController.getProductProfitAnalysis` |
| **GET** | `/api/v1/invoices/reports/profit` | *(No URL parameters)* <br/> Handler: `invoiceProfitController.profitSummary` |
| **POST** | `/api/v1/invoices/check-stock` | *(No URL parameters)* <br/> Handler: `Unknown Controller Method` |
| **PATCH** | `/api/v1/invoices/bulk/status` | *(No URL parameters)* <br/> Handler: `invoiceController.bulkUpdateStatus` |
| **POST** | `/api/v1/invoices/bulk/create` | *(No URL parameters)* <br/> Handler: `invoiceController.bulkCreateInvoices` |
| **POST** | `/api/v1/invoices/bulk/cancel` | *(No URL parameters)* <br/> Handler: `invoiceController.bulkCancelInvoices` |
| **GET** | `/api/v1/invoices/validate/number/:number` | **URL Params:** `number` <br/> Handler: `invoiceController.validateNumber` |
| **GET** | `/api/v1/invoices/export/all` | *(No URL parameters)* <br/> Handler: `invoiceController.exportInvoices` |
| **GET** | `/api/v1/invoices/search/:query` | **URL Params:** `query` <br/> Handler: `invoiceController.searchInvoices` |
| **GET** | `/api/v1/invoices/drafts/all` | *(No URL parameters)* <br/> Handler: `invoiceController.getAllDrafts` |
| **DELETE** | `/api/v1/invoices/drafts/bulk` | *(No URL parameters)* <br/> Handler: `invoiceController.bulkDeleteDrafts` |
| **GET** | `/api/v1/invoices/trash/all` | *(No URL parameters)* <br/> Handler: `invoiceController.getDeletedInvoices` |
| **POST** | `/api/v1/invoices/recurring` | *(No URL parameters)* <br/> Handler: `invoiceController.createRecurringInvoice` |
| **POST** | `/api/v1/invoices/recurring/generate` | *(No URL parameters)* <br/> Handler: `invoiceController.generateRecurringInvoices` |
| **GET** | `/api/v1/invoices/customer/:customerId/summary` | **URL Params:** `customerId` <br/> Handler: `Unknown Controller Method` |
| **GET** | `/api/v1/invoices/customer/:customerId` | **URL Params:** `customerId` <br/> Handler: `invoiceController.getInvoicesByCustomer` |
| **GET** | `/api/v1/invoices/:id/stock-info` | **URL Params:** `id` <br/> Handler: `invoiceController.getInvoiceWithStock` |
| **POST** | `/api/v1/invoices/:id/cancel` | **URL Params:** `id` <br/> Handler: `invoiceController.cancelInvoice` |
| **POST** | `/api/v1/invoices/:id/convert` | **URL Params:** `id` <br/> Handler: `invoiceController.convertDraftToActive` |
| **GET** | `/api/v1/invoices/:id/history` | **URL Params:** `id` <br/> Handler: `Unknown Controller Method` |
| **GET** | `/api/v1/invoices/:id/download` | **URL Params:** `id` <br/> Handler: `invoicePDFController.downloadInvoicePDF` |
| **POST** | `/api/v1/invoices/:id/email` | **URL Params:** `id` <br/> Handler: `invoicePDFController.emailInvoice` |
| **GET** | `/api/v1/invoices/:id/qr-code` | **URL Params:** `id` <br/> Handler: `invoiceController.generateQRCode` |
| **POST** | `/api/v1/invoices/:id/restore` | **URL Params:** `id` <br/> Handler: `invoiceController.restoreInvoice` |
| **POST** | `/api/v1/invoices/:id/webhook` | **URL Params:** `id` <br/> Handler: `invoiceController.triggerWebhook` |
| **POST** | `/api/v1/invoices/:id/sync/accounting` | **URL Params:** `id` <br/> Handler: `invoiceController.syncWithAccounting` |
| **GET** | `/api/v1/invoices` | *(No URL parameters)* <br/> Handler: `Unknown Controller Method` |
| **POST** | `/api/v1/invoices` | *(No URL parameters)* <br/> Handler: `invoiceController.createInvoice` |
| **GET** | `/api/v1/invoices/:id` | **URL Params:** `id` <br/> Handler: `Unknown Controller Method` |
| **PATCH** | `/api/v1/invoices/:id` | **URL Params:** `id` <br/> Handler: `invoiceController.updateInvoice` |
| **DELETE** | `/api/v1/invoices/:id` | **URL Params:** `id` <br/> Handler: `Unknown Controller Method` |
| **GET** | `/api/v1/invoices/:id` | **URL Params:** `id` <br/> Handler: `Unknown Controller Method` |
| **GET** | `/api/v1/invoices/:id` | **URL Params:** `id` <br/> Handler: `Unknown Controller Method` |
| **POST** | `/api/v1/invoices/:id` | **URL Params:** `id` <br/> Handler: `invoiceController.cancelInvoice` |
| **POST** | `/api/v1/invoices/:id` | **URL Params:** `id` <br/> Handler: `invoiceController.convertDraftToActive` |
| **GET** | `/api/v1/invoices/:id` | **URL Params:** `id` <br/> Handler: `Unknown Controller Method` |
| **GET** | `/api/v1/invoices/:id/payments` | **URL Params:** `id` <br/> Handler: `Unknown Controller Method` |
| **POST** | `/api/v1/invoices/:id/payments` | **URL Params:** `id` <br/> Handler: `invoiceController.addPayment` |
| **GET** | `/api/v1/invoices/:id/payments` | **URL Params:** `id` <br/> Handler: `invoicePDFController.downloadInvoicePDF` |
| **POST** | `/api/v1/invoices/:id/payments` | **URL Params:** `id` <br/> Handler: `invoiceController.sendInvoiceEmail` |
| **POST** | `/api/v1/invoices/:id/payments` | **URL Params:** `id` <br/> Handler: `invoiceController.restoreInvoice` |
| **GET** | `/api/v1/invoices` | *(No URL parameters)* <br/> Handler: `Unknown Controller Method` |
| **POST** | `/api/v1/invoices` | *(No URL parameters)* <br/> Handler: `invoiceController.createInvoice` |
| **GET** | `/api/v1/invoices/:id` | **URL Params:** `id` <br/> Handler: `Unknown Controller Method` |
| **PATCH** | `/api/v1/invoices/:id` | **URL Params:** `id` <br/> Handler: `invoiceController.updateInvoice` |
| **DELETE** | `/api/v1/invoices/:id` | **URL Params:** `id` <br/> Handler: `Unknown Controller Method` |
| **GET** | `/api/v1/invoices/:id` | **URL Params:** `id` <br/> Handler: `Unknown Controller Method` |
| **POST** | `/api/v1/invoices/:id` | **URL Params:** `id` <br/> Handler: `invoiceController.cancelInvoice` |
| **POST** | `/api/v1/invoices/:id` | **URL Params:** `id` <br/> Handler: `invoiceController.convertDraftToActive` |
| **GET** | `/api/v1/invoices/:id` | **URL Params:** `id` <br/> Handler: `Unknown Controller Method` |
| **GET** | `/api/v1/invoices/:id/payments` | **URL Params:** `id` <br/> Handler: `Unknown Controller Method` |
| **POST** | `/api/v1/invoices/:id/payments` | **URL Params:** `id` <br/> Handler: `invoiceController.addPayment` |
| **GET** | `/api/v1/invoices/:id/payments` | **URL Params:** `id` <br/> Handler: `invoicePDFController.downloadInvoicePDF` |
| **POST** | `/api/v1/invoices/:id/payments` | **URL Params:** `id` <br/> Handler: `invoicePDFController.emailInvoice` |
| **GET** | `/api/v1/invoices/:id/payments` | **URL Params:** `id` <br/> Handler: `invoiceController.generateQRCode` |
| **POST** | `/api/v1/invoices/:id/payments` | **URL Params:** `id` <br/> Handler: `invoiceController.restoreInvoice` |
| **POST** | `/api/v1/invoices/:id/payments` | **URL Params:** `id` <br/> Handler: `invoiceController.triggerWebhook` |
| **POST** | `/api/v1/invoices/:id/payments` | **URL Params:** `id` <br/> Handler: `invoiceController.syncWithAccounting` |

## /api/v1/invoices/pdf Routes
*Source Location: /src/routes\v1\invoicePDF.routes.js*

| Method | Endpoint Path | URL Parameters & Route Handler |
|--------|---------------|----------------------------------|
| **GET** | `/api/v1/invoices/pdf/:id/download` | **URL Params:** `id` <br/> Handler: `invoicePDFController.downloadInvoicePDF` |
| **POST** | `/api/v1/invoices/pdf/:id/email` | **URL Params:** `id` <br/> Handler: `invoicePDFController.emailInvoice` |

## /api/v1/payments Routes
*Source Location: /src/routes\v1\payment.routes.js*

| Method | Endpoint Path | URL Parameters & Route Handler |
|--------|---------------|----------------------------------|
| **POST** | `/api/v1/payments/webhook` | *(No URL parameters)* <br/> Handler: `paymentController.paymentGatewayWebhook` |
| **GET** | `/api/v1/payments/export` | *(No URL parameters)* <br/> Handler: `paymentController.exportPayments` |
| **GET** | `/api/v1/payments/allocation/report` | *(No URL parameters)* <br/> Handler: `paymentController.getAllocationReport` |
| **GET** | `/api/v1/payments/customer/:customerId` | **URL Params:** `customerId` <br/> Handler: `paymentController.getPaymentsByCustomer` |
| **GET** | `/api/v1/payments/customer/:customerId/summary` | **URL Params:** `customerId` <br/> Handler: `paymentController.getCustomerPaymentSummary` |
| **GET** | `/api/v1/payments/customer/:customerId/unallocated` | **URL Params:** `customerId` <br/> Handler: `paymentController.getUnallocatedPayments` |
| **GET** | `/api/v1/payments/supplier/:supplierId` | **URL Params:** `supplierId` <br/> Handler: `paymentController.getPaymentsBySupplier` |
| **POST** | `/api/v1/payments/:id/cancel` | **URL Params:** `id` <br/> Handler: `paymentController.cancelPayment` |
| **GET** | `/api/v1/payments/:id/receipt` | **URL Params:** `id` <br/> Handler: `paymentController.downloadReceipt` |
| **POST** | `/api/v1/payments/:id/email` | **URL Params:** `id` <br/> Handler: `paymentController.emailReceipt` |
| **POST** | `/api/v1/payments/:paymentId/allocate/auto` | **URL Params:** `paymentId` <br/> Handler: `paymentController.autoAllocatePayment` |
| **POST** | `/api/v1/payments/:paymentId/allocate/manual` | **URL Params:** `paymentId` <br/> Handler: `paymentController.manualAllocatePayment` |
| **GET** | `/api/v1/payments/reports/allocation` | *(No URL parameters)* <br/> Handler: `paymentController.getAllocationReport` |
| **GET** | `/api/v1/payments/export` | *(No URL parameters)* <br/> Handler: `paymentController.exportPayments` |
| **GET** | `/api/v1/payments/customer/:customerId/summary` | **URL Params:** `customerId` <br/> Handler: `paymentController.getCustomerPaymentSummary` |
| **GET** | `/api/v1/payments/customer/:customerId/unallocated` | **URL Params:** `customerId` <br/> Handler: `paymentController.getUnallocatedPayments` |
| **GET** | `/api/v1/payments/customer/:customerId` | **URL Params:** `customerId` <br/> Handler: `paymentController.getPaymentsByCustomer` |
| **GET** | `/api/v1/payments/supplier/:supplierId` | **URL Params:** `supplierId` <br/> Handler: `paymentController.getPaymentsBySupplier` |
| **POST** | `/api/v1/payments/:paymentId/allocate/auto` | **URL Params:** `paymentId` <br/> Handler: `paymentController.autoAllocatePayment` |
| **POST** | `/api/v1/payments/:paymentId/allocate/manual` | **URL Params:** `paymentId` <br/> Handler: `paymentController.manualAllocatePayment` |
| **GET** | `/api/v1/payments/:id/receipt/download` | **URL Params:** `id` <br/> Handler: `paymentController.downloadReceipt` |
| **POST** | `/api/v1/payments/:id/receipt/email` | **URL Params:** `id` <br/> Handler: `paymentController.emailReceipt` |
| **GET** | `/api/v1/payments` | *(No URL parameters)* <br/> Handler: `Unknown Controller Method` |
| **POST** | `/api/v1/payments` | *(No URL parameters)* <br/> Handler: `paymentController.createPayment` |
| **GET** | `/api/v1/payments/:id` | **URL Params:** `id` <br/> Handler: `Unknown Controller Method` |
| **DELETE** | `/api/v1/payments/:id` | **URL Params:** `id` <br/> Handler: `Unknown Controller Method` |
| **POST** | `/api/v1/payments/:id` | **URL Params:** `id` <br/> Handler: `paymentController.cancelPayment` |
| **GET** | `/api/v1/payments/:id` | **URL Params:** `id` <br/> Handler: `paymentController.downloadReceipt` |
| **POST** | `/api/v1/payments/:id` | **URL Params:** `id` <br/> Handler: `paymentController.emailReceipt` |
| **POST** | `/api/v1/payments/:id` | **URL Params:** `id` <br/> Handler: `paymentController.autoAllocatePayment` |
| **POST** | `/api/v1/payments/:id` | **URL Params:** `id` <br/> Handler: `paymentController.manualAllocatePayment` |
| **GET** | `/api/v1/payments` | *(No URL parameters)* <br/> Handler: `Unknown Controller Method` |
| **POST** | `/api/v1/payments` | *(No URL parameters)* <br/> Handler: `paymentController.createPayment` |
| **POST** | `/api/v1/payments` | *(No URL parameters)* <br/> Handler: `paymentController.autoAllocatePayment` |
| **POST** | `/api/v1/payments` | *(No URL parameters)* <br/> Handler: `paymentController.manualAllocatePayment` |
| **GET** | `/api/v1/payments` | *(No URL parameters)* <br/> Handler: `paymentController.downloadReceipt` |
| **POST** | `/api/v1/payments` | *(No URL parameters)* <br/> Handler: `paymentController.emailReceipt` |
| **GET** | `/api/v1/payments/:id` | **URL Params:** `id` <br/> Handler: `Unknown Controller Method` |
| **PATCH** | `/api/v1/payments/:id` | **URL Params:** `id` <br/> Handler: `paymentController.updatePayment` |
| **DELETE** | `/api/v1/payments/:id` | **URL Params:** `id` <br/> Handler: `Unknown Controller Method` |

## /api/v1/emi Routes
*Source Location: /src/routes\v1\emi.routes.js*

| Method | Endpoint Path | URL Parameters & Route Handler |
|--------|---------------|----------------------------------|
| **GET** | `/api/v1/emi/analytics` | *(No URL parameters)* <br/> Handler: `emiController.getEmiAnalytics` |
| **GET** | `/api/v1/emi/ledger` | *(No URL parameters)* <br/> Handler: `emiController.getEmiLedgerReport` |
| **POST** | `/api/v1/emi/mark-overdue` | *(No URL parameters)* <br/> Handler: `emiController.markOverdueInstallments` |
| **GET** | `/api/v1/emi/invoice/:invoiceId` | **URL Params:** `invoiceId` <br/> Handler: `emiController.getEmiByInvoice` |
| **POST** | `/api/v1/emi/:id/pay` | **URL Params:** `id` <br/> Handler: `emiController.payEmiInstallment` |
| **GET** | `/api/v1/emi/:id/history` | **URL Params:** `id` <br/> Handler: `emiController.getEmiHistory` |
| **POST** | `/api/v1/emi/:id/apply-advance` | **URL Params:** `id` <br/> Handler: `emiController.applyAdvanceBalance` |
| **GET** | `/api/v1/emi/reports/ledger` | *(No URL parameters)* <br/> Handler: `emiController.getEmiLedgerReport` |
| **GET** | `/api/v1/emi/analytics/summary` | *(No URL parameters)* <br/> Handler: `emiController.getEmiAnalytics` |
| **GET** | `/api/v1/emi/:id/history` | **URL Params:** `id` <br/> Handler: `emiController.getEmiHistory` |
| **GET** | `/api/v1/emi` | *(No URL parameters)* <br/> Handler: `Unknown Controller Method` |
| **POST** | `/api/v1/emi` | *(No URL parameters)* <br/> Handler: `emiController.createEmiPlan` |
| **GET** | `/api/v1/emi/:id` | **URL Params:** `id` <br/> Handler: `Unknown Controller Method` |
| **DELETE** | `/api/v1/emi/:id` | **URL Params:** `id` <br/> Handler: `Unknown Controller Method` |
| **POST** | `/api/v1/emi/:id` | **URL Params:** `id` <br/> Handler: `emiController.payEmiInstallment` |
| **GET** | `/api/v1/emi/:id` | **URL Params:** `id` <br/> Handler: `Unknown Controller Method` |
| **POST** | `/api/v1/emi/:id` | **URL Params:** `id` <br/> Handler: `emiController.applyAdvanceBalance` |
| **GET** | `/api/v1/emi` | *(No URL parameters)* <br/> Handler: `Unknown Controller Method` |
| **POST** | `/api/v1/emi` | *(No URL parameters)* <br/> Handler: `emiController.createEmiPlan` |
| **GET** | `/api/v1/emi/:id` | **URL Params:** `id` <br/> Handler: `Unknown Controller Method` |
| **DELETE** | `/api/v1/emi/:id` | **URL Params:** `id` <br/> Handler: `Unknown Controller Method` |

## /api/v1/ledgers Routes
*Source Location: /src/routes\v1\ledger.routes.js*

| Method | Endpoint Path | URL Parameters & Route Handler |
|--------|---------------|----------------------------------|
| **GET** | `/api/v1/ledgers/summary/org` | *(No URL parameters)* <br/> Handler: `ledgerController.getOrganizationLedgerSummary` |
| **GET** | `/api/v1/ledgers/summary/trial-balance` | *(No URL parameters)* <br/> Handler: `ledgerController.getTrialBalance` |
| **GET** | `/api/v1/ledgers/summary/profit-loss` | *(No URL parameters)* <br/> Handler: `ledgerController.getProfitAndLoss` |
| **GET** | `/api/v1/ledgers/summary/balance-sheet` | *(No URL parameters)* <br/> Handler: `ledgerController.getBalanceSheet` |
| **GET** | `/api/v1/ledgers/summary/retained-earnings` | *(No URL parameters)* <br/> Handler: `ledgerController.getRetainedEarnings` |
| **GET** | `/api/v1/ledgers/cash-flow` | *(No URL parameters)* <br/> Handler: `ledgerController.getCashFlow` |
| **GET** | `/api/v1/ledgers/customer/:customerId` | **URL Params:** `customerId` <br/> Handler: `ledgerController.getCustomerLedger` |
| **GET** | `/api/v1/ledgers/supplier/:supplierId` | **URL Params:** `supplierId` <br/> Handler: `ledgerController.getSupplierLedger` |
| **GET** | `/api/v1/ledgers/export` | *(No URL parameters)* <br/> Handler: `ledgerController.exportLedgers` |
| **GET** | `/api/v1/ledgers/account/:accountId` | **URL Params:** `accountId` <br/> Handler: `ledgerController.getAccountDrillDown` |
| **GET** | `/api/v1/ledgers` | *(No URL parameters)* <br/> Handler: `ledgerController.getAllLedgers` |
| **GET** | `/api/v1/ledgers/:id` | **URL Params:** `id` <br/> Handler: `Unknown Controller Method` |
| **DELETE** | `/api/v1/ledgers/:id` | **URL Params:** `id` <br/> Handler: `Unknown Controller Method` |

## /api/v1/transactions Routes
*Source Location: /src/routes\v1\transaction.routes.js*

| Method | Endpoint Path | URL Parameters & Route Handler |
|--------|---------------|----------------------------------|
| **GET** | `/api/v1/transactions` | *(No URL parameters)* <br/> Handler: `transactionController.getTransactions` |
| **GET** | `/api/v1/transactions/export` | *(No URL parameters)* <br/> Handler: `transactionController.exportTransactionsCsv` |

## /api/v1/reconciliation Routes
*Source Location: /src/routes\v1\reconciliation.routes.js*

| Method | Endpoint Path | URL Parameters & Route Handler |
|--------|---------------|----------------------------------|
| **POST** | `/api/v1/reconciliation/webhook/payment` | *(No URL parameters)* <br/> Handler: `paymentWebhookController.paymentGatewayWebhook` |
| **GET** | `/api/v1/reconciliation/pending` | *(No URL parameters)* <br/> Handler: `reconciliationController.getPendingReconciliations` |
| **POST** | `/api/v1/reconciliation/manual` | *(No URL parameters)* <br/> Handler: `reconciliationController.manualReconcilePayment` |
| **GET** | `/api/v1/reconciliation/summary` | *(No URL parameters)* <br/> Handler: `reconciliationController.getReconciliationSummary` |

## /api/v1/statements Routes
*Source Location: /src/routes\v1\statements.routes.js*

| Method | Endpoint Path | URL Parameters & Route Handler |
|--------|---------------|----------------------------------|
| **GET** | `/api/v1/statements/pl` | *(No URL parameters)* <br/> Handler: `statementsController.pl` |
| **GET** | `/api/v1/statements/balance-sheet` | *(No URL parameters)* <br/> Handler: `statementsController.balanceSheet` |
| **GET** | `/api/v1/statements/trial-balance` | *(No URL parameters)* <br/> Handler: `statementsController.trialBalance` |
| **GET** | `/api/v1/statements/export` | *(No URL parameters)* <br/> Handler: `statementsController.exportStatement` |

## /api/v1/partytransactions Routes
*Source Location: /src/routes\v1\partyTransaction.routes.js*

| Method | Endpoint Path | URL Parameters & Route Handler |
|--------|---------------|----------------------------------|
| **GET** | `/api/v1/partytransactions/customers/:id/transactions` | **URL Params:** `id` <br/> Handler: `partyTransactionController.getCustomerTransactions` |
| **GET** | `/api/v1/partytransactions/suppliers/:id/transactions` | **URL Params:** `id` <br/> Handler: `partyTransactionController.getSupplierTransactions` |

## /api/v1/inventory Routes
*Source Location: /src/routes\v1\inventory.routes.js*

| Method | Endpoint Path | URL Parameters & Route Handler |
|--------|---------------|----------------------------------|
| **POST** | `/api/v1/inventory/transfer` | *(No URL parameters)* <br/> Handler: `inventoryController.transferStock` |
| **POST** | `/api/v1/inventory/adjust` | *(No URL parameters)* <br/> Handler: `inventoryController.adjustStock` |

## /api/v1/products Routes
*Source Location: /src/routes\v1\product.routes.js*

| Method | Endpoint Path | URL Parameters & Route Handler |
|--------|---------------|----------------------------------|
| **GET** | `/api/v1/products/search` | *(No URL parameters)* <br/> Handler: `productController.searchProducts` |
| **POST** | `/api/v1/products/bulk-import` | *(No URL parameters)* <br/> Handler: `productController.bulkImportProducts` |
| **POST** | `/api/v1/products/bulk-update` | *(No URL parameters)* <br/> Handler: `productController.bulkUpdateProducts` |
| **GET** | `/api/v1/products/reports/low-stock` | *(No URL parameters)* <br/> Handler: `productController.getLowStockProducts` |
| **POST** | `/api/v1/products/scan` | *(No URL parameters)* <br/> Handler: `productController.scanProduct` |
| **POST** | `/api/v1/products/:id/stock-adjust` | **URL Params:** `id` <br/> Handler: `productController.adjustStock` |
| **POST** | `/api/v1/products/:id/stock-transfer` | **URL Params:** `id` <br/> Handler: `productController.transferStock` |
| **PATCH** | `/api/v1/products/:id/upload` | **URL Params:** `id` <br/> Handler: `productController.uploadProductImage` |
| **PATCH** | `/api/v1/products/:id/restore` | **URL Params:** `id` <br/> Handler: `productController.restoreProduct` |
| **GET** | `/api/v1/products/:id/history` | **URL Params:** `id` <br/> Handler: `productController.getProductHistory` |
| **GET** | `/api/v1/products` | *(No URL parameters)* <br/> Handler: `Unknown Controller Method` |
| **POST** | `/api/v1/products` | *(No URL parameters)* <br/> Handler: `productController.createProduct` |
| **POST** | `/api/v1/products` | *(No URL parameters)* <br/> Handler: `productController.scanProduct` |
| **POST** | `/api/v1/products` | *(No URL parameters)* <br/> Handler: `productController.adjustStock` |
| **POST** | `/api/v1/products` | *(No URL parameters)* <br/> Handler: `productController.transferStock` |
| **PATCH** | `/api/v1/products` | *(No URL parameters)* <br/> Handler: `productController.uploadProductImage` |
| **PATCH** | `/api/v1/products` | *(No URL parameters)* <br/> Handler: `productController.restoreProduct` |
| **GET** | `/api/v1/products` | *(No URL parameters)* <br/> Handler: `Unknown Controller Method` |
| **GET** | `/api/v1/products/:id` | **URL Params:** `id` <br/> Handler: `Unknown Controller Method` |
| **PATCH** | `/api/v1/products/:id` | **URL Params:** `id` <br/> Handler: `productController.updateProduct` |
| **DELETE** | `/api/v1/products/:id` | **URL Params:** `id` <br/> Handler: `Unknown Controller Method` |

## /api/v1/purchases Routes
*Source Location: /src/routes\v1\purchase.routes.js*

| Method | Endpoint Path | URL Parameters & Route Handler |
|--------|---------------|----------------------------------|
| **GET** | `/api/v1/purchases/analytics` | *(No URL parameters)* <br/> Handler: `purchaseController.getPurchaseAnalytics` |
| **GET** | `/api/v1/purchases/pending-payments` | *(No URL parameters)* <br/> Handler: `purchaseController.getPendingPayments` |
| **GET** | `/api/v1/purchases/returns` | *(No URL parameters)* <br/> Handler: `purchaseController.getAllReturns` |
| **GET** | `/api/v1/purchases/returns/:id` | **URL Params:** `id` <br/> Handler: `purchaseController.getReturnById` |
| **PATCH** | `/api/v1/purchases/bulk-update` | *(No URL parameters)* <br/> Handler: `purchaseController.bulkUpdatePurchases` |
| **PATCH** | `/api/v1/purchases/:id/status` | **URL Params:** `id` <br/> Handler: `purchaseController.updateStatus` |
| **POST** | `/api/v1/purchases/:id/attachments` | **URL Params:** `id` <br/> Handler: `purchaseController.addAttachments` |
| **DELETE** | `/api/v1/purchases/:id/attachments/:fileIndex` | **URL Params:** `id`, `fileIndex` <br/> Handler: `purchaseController.deleteAttachment` |
| **POST** | `/api/v1/purchases/:id/cancel` | **URL Params:** `id` <br/> Handler: `purchaseController.cancelPurchase` |
| **POST** | `/api/v1/purchases/:id/payments` | **URL Params:** `id` <br/> Handler: `purchaseController.recordPayment` |
| **GET** | `/api/v1/purchases/:id/payments` | **URL Params:** `id` <br/> Handler: `purchaseController.getPaymentHistory` |
| **DELETE** | `/api/v1/purchases/:id/payments/:paymentId` | **URL Params:** `id`, `paymentId` <br/> Handler: `purchaseController.deletePayment` |
| **POST** | `/api/v1/purchases/:id/return` | **URL Params:** `id` <br/> Handler: `purchaseController.partialReturn` |
| **GET** | `/api/v1/purchases` | *(No URL parameters)* <br/> Handler: `Unknown Controller Method` |
| **POST** | `/api/v1/purchases` | *(No URL parameters)* <br/> Handler: `purchaseController.createPurchase` |
| **GET** | `/api/v1/purchases/:id` | **URL Params:** `id` <br/> Handler: `Unknown Controller Method` |
| **PATCH** | `/api/v1/purchases/:id` | **URL Params:** `id` <br/> Handler: `purchaseController.updatePurchase` |
| **DELETE** | `/api/v1/purchases/:id` | **URL Params:** `id` <br/> Handler: `Unknown Controller Method` |
| **PATCH** | `/api/v1/purchases/:id` | **URL Params:** `id` <br/> Handler: `purchaseController.updateStatus` |
| **POST** | `/api/v1/purchases/:id` | **URL Params:** `id` <br/> Handler: `purchaseController.addAttachments` |
| **DELETE** | `/api/v1/purchases/:id` | **URL Params:** `id` <br/> Handler: `Unknown Controller Method` |
| **POST** | `/api/v1/purchases/:id` | **URL Params:** `id` <br/> Handler: `purchaseController.cancelPurchase` |
| **POST** | `/api/v1/purchases/:id` | **URL Params:** `id` <br/> Handler: `purchaseController.recordPayment` |
| **GET** | `/api/v1/purchases/:id` | **URL Params:** `id` <br/> Handler: `Unknown Controller Method` |
| **DELETE** | `/api/v1/purchases/:id` | **URL Params:** `id` <br/> Handler: `Unknown Controller Method` |
| **POST** | `/api/v1/purchases/:id` | **URL Params:** `id` <br/> Handler: `purchaseController.partialReturn` |

## /api/v1/sales Routes
*Source Location: /src/routes\v1\sales.routes.js*

| Method | Endpoint Path | URL Parameters & Route Handler |
|--------|---------------|----------------------------------|
| **GET** | `/api/v1/sales/stats` | *(No URL parameters)* <br/> Handler: `salesController.getSalesStats` |
| **GET** | `/api/v1/sales/export` | *(No URL parameters)* <br/> Handler: `salesController.exportSales` |
| **GET** | `/api/v1/sales/totals` | *(No URL parameters)* <br/> Handler: `salesController.aggregateTotals` |
| **POST** | `/api/v1/sales/returns` | *(No URL parameters)* <br/> Handler: `salesReturnController.createReturn` |
| **GET** | `/api/v1/sales/returns` | *(No URL parameters)* <br/> Handler: `salesReturnController.getReturns` |
| **GET** | `/api/v1/sales/returns/:id` | **URL Params:** `id` <br/> Handler: `salesReturnController.getReturn` |
| **PATCH** | `/api/v1/sales/returns/:id/approve` | **URL Params:** `id` <br/> Handler: `salesReturnController.approveReturn` |
| **PATCH** | `/api/v1/sales/returns/:id/reject` | **URL Params:** `id` <br/> Handler: `salesReturnController.rejectReturn` |
| **POST** | `/api/v1/sales/from-invoice/:invoiceId` | **URL Params:** `invoiceId` <br/> Handler: `salesController.createFromInvoice` |
| **GET** | `/api/v1/sales/stats` | *(No URL parameters)* <br/> Handler: `salesController.getSalesStats` |
| **GET** | `/api/v1/sales/export` | *(No URL parameters)* <br/> Handler: `salesController.exportSales` |
| **POST** | `/api/v1/sales/returns` | *(No URL parameters)* <br/> Handler: `salesReturnController.createReturn` |
| **GET** | `/api/v1/sales/returns` | *(No URL parameters)* <br/> Handler: `salesReturnController.getReturns` |
| **POST** | `/api/v1/sales/from-invoice/:invoiceId` | **URL Params:** `invoiceId` <br/> Handler: `salesController.createFromInvoice` |
| **GET** | `/api/v1/sales` | *(No URL parameters)* <br/> Handler: `Unknown Controller Method` |
| **POST** | `/api/v1/sales` | *(No URL parameters)* <br/> Handler: `salesController.createSales` |
| **GET** | `/api/v1/sales/:id` | **URL Params:** `id` <br/> Handler: `Unknown Controller Method` |
| **PUT** | `/api/v1/sales/:id` | **URL Params:** `id` <br/> Handler: `salesController.updateSales` |
| **DELETE** | `/api/v1/sales/:id` | **URL Params:** `id` <br/> Handler: `Unknown Controller Method` |

## /api/v1/stock Routes
*Source Location: /src/routes\v1\stock.routes.js*

| Method | Endpoint Path | URL Parameters & Route Handler |
|--------|---------------|----------------------------------|
| **GET** | `/api/v1/stock/branch/:branchId` | **URL Params:** `branchId` <br/> Handler: `stockController.getBranchStock` |
| **GET** | `/api/v1/stock/movement/:productId` | **URL Params:** `productId` <br/> Handler: `stockController.getStockMovement` |
| **GET** | `/api/v1/stock/low-stock` | *(No URL parameters)* <br/> Handler: `stockController.getLowStock` |
| **GET** | `/api/v1/stock/value` | *(No URL parameters)* <br/> Handler: `stockController.getStockValue` |
| **GET** | `/api/v1/stock/aging` | *(No URL parameters)* <br/> Handler: `stockController.getStockAging` |
| **PUT** | `/api/v1/stock/reorder-level/:productId` | **URL Params:** `productId` <br/> Handler: `stockController.updateReorderLevel` |
| **POST** | `/api/v1/stock/transfer` | *(No URL parameters)* <br/> Handler: `stockController.transferStock` |
| **GET** | `/api/v1/stock/branch/:branchId` | **URL Params:** `branchId` <br/> Handler: `stockController.getBranchStock` |
| **GET** | `/api/v1/stock/movement/:productId` | **URL Params:** `productId` <br/> Handler: `stockController.getStockMovement` |
| **GET** | `/api/v1/stock/low-stock` | *(No URL parameters)* <br/> Handler: `stockController.getLowStock` |
| **GET** | `/api/v1/stock/value` | *(No URL parameters)* <br/> Handler: `stockController.getStockValue` |
| **GET** | `/api/v1/stock/aging` | *(No URL parameters)* <br/> Handler: `stockController.getStockAging` |
| **PUT** | `/api/v1/stock/reorder-level/:productId` | **URL Params:** `productId` <br/> Handler: `stockController.updateReorderLevel` |
| **POST** | `/api/v1/stock/transfer` | *(No URL parameters)* <br/> Handler: `stockController.transferStock` |

## /api/v1/organization Routes
*Source Location: /src/routes\v1\organization.routes.js*

| Method | Endpoint Path | URL Parameters & Route Handler |
|--------|---------------|----------------------------------|
| **POST** | `/api/v1/organization/create` | *(No URL parameters)* <br/> Handler: `organizationController.createOrganization` |
| **POST** | `/api/v1/organization/lookup` | *(No URL parameters)* <br/> Handler: `organizationController.lookupOrganizations` |
| **GET** | `/api/v1/organization/shop/:uniqueShopId` | **URL Params:** `uniqueShopId` <br/> Handler: `organizationController.getOrganizationByShopId` |
| **GET** | `/api/v1/organization/pending-members` | *(No URL parameters)* <br/> Handler: `organizationController.getPendingMembers` |
| **POST** | `/api/v1/organization/approve-member` | *(No URL parameters)* <br/> Handler: `organizationController.approveMember` |
| **POST** | `/api/v1/organization/reject-member` | *(No URL parameters)* <br/> Handler: `organizationController.rejectMember` |
| **GET** | `/api/v1/organization/my-organization` | *(No URL parameters)* <br/> Handler: `Unknown Controller Method` |
| **PATCH** | `/api/v1/organization/my-organization` | *(No URL parameters)* <br/> Handler: `organizationController.updateMyOrganization` |
| **DELETE** | `/api/v1/organization/my-organization` | *(No URL parameters)* <br/> Handler: `Unknown Controller Method` |
| **GET** | `/api/v1/organization` | *(No URL parameters)* <br/> Handler: `Unknown Controller Method` |
| **GET** | `/api/v1/organization/:id` | **URL Params:** `id` <br/> Handler: `Unknown Controller Method` |
| **PATCH** | `/api/v1/organization/:id` | **URL Params:** `id` <br/> Handler: `organizationController.updateOrganization` |
| **DELETE** | `/api/v1/organization/:id` | **URL Params:** `id` <br/> Handler: `Unknown Controller Method` |

## /api/v1/neworganization Routes
*Source Location: /src/routes\v1\organizationExtras.routes.js*

| Method | Endpoint Path | URL Parameters & Route Handler |
|--------|---------------|----------------------------------|
| **PATCH** | `/api/v1/neworganization/transfer-ownership` | *(No URL parameters)* <br/> Handler: `orgController.transferOwnership` |
| **POST** | `/api/v1/neworganization/invite` | *(No URL parameters)* <br/> Handler: `orgController.inviteUser` |
| **GET** | `/api/v1/neworganization/activity-log` | *(No URL parameters)* <br/> Handler: `orgController.getActivityLog` |
| **DELETE** | `/api/v1/neworganization/members/:id` | **URL Params:** `id` <br/> Handler: `orgController.removeMember` |

## /api/v1/branches Routes
*Source Location: /src/routes\v1\branch.routes.js*

| Method | Endpoint Path | URL Parameters & Route Handler |
|--------|---------------|----------------------------------|
| **GET** | `/api/v1/branches/my-branches` | *(No URL parameters)* <br/> Handler: `branchController.getMyBranches` |
| **POST** | `/api/v1/branches` | *(No URL parameters)* <br/> Handler: `branchController.createBranch` |
| **GET** | `/api/v1/branches` | *(No URL parameters)* <br/> Handler: `Unknown Controller Method` |
| **GET** | `/api/v1/branches/:id` | **URL Params:** `id` <br/> Handler: `Unknown Controller Method` |
| **PATCH** | `/api/v1/branches/:id` | **URL Params:** `id` <br/> Handler: `branchController.updateBranch` |
| **DELETE** | `/api/v1/branches/:id` | **URL Params:** `id` <br/> Handler: `Unknown Controller Method` |

## /api/v1/customers Routes
*Source Location: /src/routes\v1\customer.routes.js*

| Method | Endpoint Path | URL Parameters & Route Handler |
|--------|---------------|----------------------------------|
| **GET** | `/api/v1/customers/search` | *(No URL parameters)* <br/> Handler: `customerController.searchCustomers` |
| **GET** | `/api/v1/customers/check-duplicate` | *(No URL parameters)* <br/> Handler: `customerController.checkDuplicate` |
| **POST** | `/api/v1/customers/bulk-update` | *(No URL parameters)* <br/> Handler: `customerController.bulkUpdateCustomers` |
| **POST** | `/api/v1/customers/bulk-customer` | *(No URL parameters)* <br/> Handler: `customerController.createBulkCustomer` |
| **PATCH** | `/api/v1/customers/:id/upload` | **URL Params:** `id` <br/> Handler: `customerController.uploadCustomerPhoto` |
| **PATCH** | `/api/v1/customers/:id/restore` | **URL Params:** `id` <br/> Handler: `customerController.restoreCustomer` |
| **PATCH** | `/api/v1/customers/:id/credit-limit` | **URL Params:** `id` <br/> Handler: `customerController.updateCreditLimit` |
| **GET** | `/api/v1/customers` | *(No URL parameters)* <br/> Handler: `Unknown Controller Method` |
| **POST** | `/api/v1/customers` | *(No URL parameters)* <br/> Handler: `customerController.createCustomer` |
| **GET** | `/api/v1/customers/:id` | **URL Params:** `id` <br/> Handler: `Unknown Controller Method` |
| **PATCH** | `/api/v1/customers/:id` | **URL Params:** `id` <br/> Handler: `customerController.updateCustomer` |
| **DELETE** | `/api/v1/customers/:id` | **URL Params:** `id` <br/> Handler: `Unknown Controller Method` |

## /api/v1/suppliers Routes
*Source Location: /src/routes\v1\supplier.routes.js*

| Method | Endpoint Path | URL Parameters & Route Handler |
|--------|---------------|----------------------------------|
| **GET** | `/api/v1/suppliers/search` | *(No URL parameters)* <br/> Handler: `supplierController.searchSuppliers` |
| **GET** | `/api/v1/suppliers/list` | *(No URL parameters)* <br/> Handler: `supplierController.getSupplierList` |
| **POST** | `/api/v1/suppliers/:id/kyc` | **URL Params:** `id` <br/> Handler: `supplierController.uploadKycDocument` |
| **DELETE** | `/api/v1/suppliers/:id/kyc/:docIndex` | **URL Params:** `id`, `docIndex` <br/> Handler: `supplierController.deleteKycDocument` |
| **GET** | `/api/v1/suppliers/:id/ledger-export` | **URL Params:** `id` <br/> Handler: `supplierController.downloadSupplierLedger` |
| **GET** | `/api/v1/suppliers/:id/dashboard` | **URL Params:** `id` <br/> Handler: `supplierController.getSupplierDashboard` |
| **GET** | `/api/v1/suppliers/search` | *(No URL parameters)* <br/> Handler: `supplierController.searchSuppliers` |
| **GET** | `/api/v1/suppliers/list` | *(No URL parameters)* <br/> Handler: `supplierController.getSupplierList` |
| **POST** | `/api/v1/suppliers/:id/kyc` | **URL Params:** `id` <br/> Handler: `supplierController.uploadKycDocument` |
| **DELETE** | `/api/v1/suppliers/:id/kyc/:docIndex` | **URL Params:** `id`, `docIndex` <br/> Handler: `supplierController.deleteKycDocument` |
| **GET** | `/api/v1/suppliers/:id/ledger-export` | **URL Params:** `id` <br/> Handler: `supplierController.downloadSupplierLedger` |
| **GET** | `/api/v1/suppliers/:id/dashboard` | **URL Params:** `id` <br/> Handler: `supplierController.getSupplierDashboard` |
| **POST** | `/api/v1/suppliers/bulk-supplier` | *(No URL parameters)* <br/> Handler: `supplierController.createbulkSupplier` |
| **POST** | `/api/v1/suppliers` | *(No URL parameters)* <br/> Handler: `supplierController.createSupplier` |
| **GET** | `/api/v1/suppliers` | *(No URL parameters)* <br/> Handler: `Unknown Controller Method` |
| **POST** | `/api/v1/suppliers` | *(No URL parameters)* <br/> Handler: `supplierController.uploadKycDocument` |
| **DELETE** | `/api/v1/suppliers` | *(No URL parameters)* <br/> Handler: `Unknown Controller Method` |
| **GET** | `/api/v1/suppliers` | *(No URL parameters)* <br/> Handler: `supplierController.downloadSupplierLedger` |
| **GET** | `/api/v1/suppliers` | *(No URL parameters)* <br/> Handler: `Unknown Controller Method` |
| **GET** | `/api/v1/suppliers/:id` | **URL Params:** `id` <br/> Handler: `Unknown Controller Method` |
| **PATCH** | `/api/v1/suppliers/:id` | **URL Params:** `id` <br/> Handler: `supplierController.updateSupplier` |
| **DELETE** | `/api/v1/suppliers/:id` | **URL Params:** `id` <br/> Handler: `Unknown Controller Method` |
| **POST** | `/api/v1/suppliers/bulk-supplier` | *(No URL parameters)* <br/> Handler: `supplierController.createbulkSupplier` |
| **POST** | `/api/v1/suppliers` | *(No URL parameters)* <br/> Handler: `supplierController.createSupplier` |
| **GET** | `/api/v1/suppliers` | *(No URL parameters)* <br/> Handler: `Unknown Controller Method` |
| **POST** | `/api/v1/suppliers` | *(No URL parameters)* <br/> Handler: `supplierController.uploadKycDocument` |
| **DELETE** | `/api/v1/suppliers` | *(No URL parameters)* <br/> Handler: `Unknown Controller Method` |
| **GET** | `/api/v1/suppliers` | *(No URL parameters)* <br/> Handler: `supplierController.downloadSupplierLedger` |
| **GET** | `/api/v1/suppliers` | *(No URL parameters)* <br/> Handler: `Unknown Controller Method` |
| **GET** | `/api/v1/suppliers/:id` | **URL Params:** `id` <br/> Handler: `Unknown Controller Method` |
| **PATCH** | `/api/v1/suppliers/:id` | **URL Params:** `id` <br/> Handler: `supplierController.updateSupplier` |
| **DELETE** | `/api/v1/suppliers/:id` | **URL Params:** `id` <br/> Handler: `Unknown Controller Method` |

## /api/v1/ownership Routes
*Source Location: /src/routes\v1\ownership.routes.js*

| Method | Endpoint Path | URL Parameters & Route Handler |
|--------|---------------|----------------------------------|
| **POST** | `/api/v1/ownership/initiate` | *(No URL parameters)* <br/> Handler: `Unknown Controller Method` |
| **POST** | `/api/v1/ownership/finalize` | *(No URL parameters)* <br/> Handler: `Unknown Controller Method` |
| **POST** | `/api/v1/ownership/cancel` | *(No URL parameters)* <br/> Handler: `Unknown Controller Method` |
| **POST** | `/api/v1/ownership/force` | *(No URL parameters)* <br/> Handler: `Unknown Controller Method` |

## /api/v1/master Routes
*Source Location: /src/routes\v1\master.routes.js*

| Method | Endpoint Path | URL Parameters & Route Handler |
|--------|---------------|----------------------------------|
| **POST** | `/api/v1/master/bulk` | *(No URL parameters)* <br/> Handler: `masterController.bulkCreateMasters` |
| **PATCH** | `/api/v1/master/bulk` | *(No URL parameters)* <br/> Handler: `masterController.bulkUpdateMasters` |
| **DELETE** | `/api/v1/master/bulk` | *(No URL parameters)* <br/> Handler: `masterController.bulkDeleteMasters` |
| **GET** | `/api/v1/master` | *(No URL parameters)* <br/> Handler: `Unknown Controller Method` |
| **POST** | `/api/v1/master` | *(No URL parameters)* <br/> Handler: `masterController.createMaster` |
| **PATCH** | `/api/v1/master/:id` | **URL Params:** `id` <br/> Handler: `masterController.updateMaster` |
| **DELETE** | `/api/v1/master/:id` | **URL Params:** `id` <br/> Handler: `Unknown Controller Method` |

## /api/v1/master-list Routes
*Source Location: /src/routes\v1\masterList.routes.js*

| Method | Endpoint Path | URL Parameters & Route Handler |
|--------|---------------|----------------------------------|
| **GET** | `/api/v1/master-list` | *(No URL parameters)* <br/> Handler: `masterListController.getMasterList` |
| **GET** | `/api/v1/master-list/list` | *(No URL parameters)* <br/> Handler: `masterListController.getSpecificList` |
| **GET** | `/api/v1/master-list/filter-options` | *(No URL parameters)* <br/> Handler: `masterListController.getFilterOptions` |
| **GET** | `/api/v1/master-list/quick-stats` | *(No URL parameters)* <br/> Handler: `masterListController.getQuickStats` |
| **GET** | `/api/v1/master-list/details/:type/:id` | **URL Params:** `type`, `id` <br/> Handler: `masterListController.getEntityDetails` |
| **GET** | `/api/v1/master-list/export` | *(No URL parameters)* <br/> Handler: `masterListController.exportMasterList` |
| **GET** | `/api/v1/master-list/export-filtered` | *(No URL parameters)* <br/> Handler: `masterListController.exportFilteredData` |
| **GET** | `/api/v1/master-list/permissions` | *(No URL parameters)* <br/> Handler: `masterListController.getPermissionsMetadata` |

## /api/v1/master-types Routes
*Source Location: /src/routes\v1\masterType.routes.js*

| Method | Endpoint Path | URL Parameters & Route Handler |
|--------|---------------|----------------------------------|
| **GET** | `/api/v1/master-types` | *(No URL parameters)* <br/> Handler: `masterTypeController.getMasterTypes` |
| **POST** | `/api/v1/master-types` | *(No URL parameters)* <br/> Handler: `masterTypeController.createMasterType` |
| **PATCH** | `/api/v1/master-types/:id` | **URL Params:** `id` <br/> Handler: `masterTypeController.updateMasterType` |
| **DELETE** | `/api/v1/master-types/:id` | **URL Params:** `id` <br/> Handler: `masterTypeController.deleteMasterType` |

## /api/v1/dropdowns Routes
*Source Location: /src/modules\master\core\routes\dropdownlist.routes.js*

| Method | Endpoint Path | URL Parameters & Route Handler |
|--------|---------------|----------------------------------|
| **GET** | `/api/v1/dropdowns/users` | *(No URL parameters)* <br/> Handler: `Unknown Controller Method` |
| **GET** | `/api/v1/dropdowns/branches` | *(No URL parameters)* <br/> Handler: `Unknown Controller Method` |
| **GET** | `/api/v1/dropdowns/roles` | *(No URL parameters)* <br/> Handler: `Unknown Controller Method` |
| **GET** | `/api/v1/dropdowns/customers` | *(No URL parameters)* <br/> Handler: `Unknown Controller Method` |
| **GET** | `/api/v1/dropdowns/suppliers` | *(No URL parameters)* <br/> Handler: `Unknown Controller Method` |
| **GET** | `/api/v1/dropdowns/masters` | *(No URL parameters)* <br/> Handler: `Unknown Controller Method` |
| **GET** | `/api/v1/dropdowns/products` | *(No URL parameters)* <br/> Handler: `Unknown Controller Method` |
| **GET** | `/api/v1/dropdowns/purchases` | *(No URL parameters)* <br/> Handler: `Unknown Controller Method` |
| **GET** | `/api/v1/dropdowns/sales` | *(No URL parameters)* <br/> Handler: `Unknown Controller Method` |
| **GET** | `/api/v1/dropdowns/accounts` | *(No URL parameters)* <br/> Handler: `Unknown Controller Method` |
| **GET** | `/api/v1/dropdowns/invoices` | *(No URL parameters)* <br/> Handler: `Unknown Controller Method` |
| **GET** | `/api/v1/dropdowns/payments` | *(No URL parameters)* <br/> Handler: `Unknown Controller Method` |
| **GET** | `/api/v1/dropdowns/emis` | *(No URL parameters)* <br/> Handler: `Unknown Controller Method` |
| **GET** | `/api/v1/dropdowns/geofencing` | *(No URL parameters)* <br/> Handler: `Unknown Controller Method` |
| **GET** | `/api/v1/dropdowns/departments` | *(No URL parameters)* <br/> Handler: `Unknown Controller Method` |
| **GET** | `/api/v1/dropdowns/designations` | *(No URL parameters)* <br/> Handler: `Unknown Controller Method` |
| **GET** | `/api/v1/dropdowns/shifts` | *(No URL parameters)* <br/> Handler: `Unknown Controller Method` |
| **GET** | `/api/v1/dropdowns/holidays` | *(No URL parameters)* <br/> Handler: `Unknown Controller Method` |
| **GET** | `/api/v1/dropdowns/shift-assignments` | *(No URL parameters)* <br/> Handler: `Unknown Controller Method` |
| **GET** | `/api/v1/dropdowns/attendance-machines` | *(No URL parameters)* <br/> Handler: `Unknown Controller Method` |

## /api/v1/analytics Routes
*Source Location: /src/routes\v1\analytics.routes.js*

| Method | Endpoint Path | URL Parameters & Route Handler |
|--------|---------------|----------------------------------|
| **GET** | `/api/v1/analytics/dashboard` | *(No URL parameters)* <br/> Handler: `analyticsController.getDashboardOverview` |
| **GET** | `/api/v1/analytics/branch-comparison` | *(No URL parameters)* <br/> Handler: `analyticsController.getBranchComparison` |
| **GET** | `/api/v1/analytics/financials` | *(No URL parameters)* <br/> Handler: `analyticsController.getFinancialDashboard` |
| **GET** | `/api/v1/analytics/cash-flow` | *(No URL parameters)* <br/> Handler: `analyticsController.getFinancialDashboard` |
| **GET** | `/api/v1/analytics/emi-analytics` | *(No URL parameters)* <br/> Handler: `analyticsController.getEMIAnalytics` |
| **GET** | `/api/v1/analytics/customer-intelligence` | *(No URL parameters)* <br/> Handler: `analyticsController.getCustomerIntelligence` |
| **GET** | `/api/v1/analytics/customer-segmentation` | *(No URL parameters)* <br/> Handler: `analyticsController.getCustomerSegmentation` |
| **GET** | `/api/v1/analytics/customer-ltv` | *(No URL parameters)* <br/> Handler: `analyticsController.getCustomerLifetimeValue` |
| **GET** | `/api/v1/analytics/churn-risk` | *(No URL parameters)* <br/> Handler: `analyticsController.getChurnRiskAnalysis` |
| **GET** | `/api/v1/analytics/market-basket` | *(No URL parameters)* <br/> Handler: `analyticsController.getMarketBasketAnalysis` |
| **GET** | `/api/v1/analytics/payment-behavior` | *(No URL parameters)* <br/> Handler: `analyticsController.getPaymentBehaviorStats` |
| **GET** | `/api/v1/analytics/customer-insights` | *(No URL parameters)* <br/> Handler: `analyticsController.getCustomerInsights` |
| **GET** | `/api/v1/analytics/inventory-health` | *(No URL parameters)* <br/> Handler: `analyticsController.getInventoryHealth` |
| **GET** | `/api/v1/analytics/product-performance` | *(No URL parameters)* <br/> Handler: `analyticsController.getProductPerformance` |
| **GET** | `/api/v1/analytics/dead-stock` | *(No URL parameters)* <br/> Handler: `analyticsController.getDeadStockReport` |
| **GET** | `/api/v1/analytics/stock-predictions` | *(No URL parameters)* <br/> Handler: `analyticsController.getStockOutPredictions` |
| **GET** | `/api/v1/analytics/category-performance` | *(No URL parameters)* <br/> Handler: `analyticsController.getCategoryAnalytics` |
| **GET** | `/api/v1/analytics/supplier-performance` | *(No URL parameters)* <br/> Handler: `analyticsController.getSupplierPerformance` |
| **GET** | `/api/v1/analytics/procurement` | *(No URL parameters)* <br/> Handler: `analyticsController.getProcurementAnalysis` |
| **GET** | `/api/v1/analytics/operational-metrics` | *(No URL parameters)* <br/> Handler: `analyticsController.getOperationalMetrics` |
| **GET** | `/api/v1/analytics/staff-performance` | *(No URL parameters)* <br/> Handler: `analyticsController.getStaffPerformance` |
| **GET** | `/api/v1/analytics/staff-attendance-performance` | *(No URL parameters)* <br/> Handler: `analyticsController.getStaffAttendancePerformance` |
| **GET** | `/api/v1/analytics/peak-hours` | *(No URL parameters)* <br/> Handler: `analyticsController.getPeakBusinessHours` |
| **GET** | `/api/v1/analytics/time-analytics` | *(No URL parameters)* <br/> Handler: `analyticsController.getTimeBasedAnalytics` |
| **GET** | `/api/v1/analytics/forecast` | *(No URL parameters)* <br/> Handler: `analyticsController.getSalesForecast` |
| **GET** | `/api/v1/analytics/predictive-analytics` | *(No URL parameters)* <br/> Handler: `analyticsController.getPredictiveAnalytics` |
| **GET** | `/api/v1/analytics/alerts/realtime` | *(No URL parameters)* <br/> Handler: `analyticsController.getRealTimeMonitoring` |
| **GET** | `/api/v1/analytics/critical-alerts` | *(No URL parameters)* <br/> Handler: `analyticsController.getCriticalAlerts` |
| **GET** | `/api/v1/analytics/security-audit` | *(No URL parameters)* <br/> Handler: `analyticsController.getSecurityAuditLog` |
| **GET** | `/api/v1/analytics/compliance-dashboard` | *(No URL parameters)* <br/> Handler: `analyticsController.getComplianceDashboard` |
| **GET** | `/api/v1/analytics/export` | *(No URL parameters)* <br/> Handler: `analyticsController.exportAnalyticsData` |
| **POST** | `/api/v1/analytics/query` | *(No URL parameters)* <br/> Handler: `analyticsController.customAnalyticsQuery` |
| **GET** | `/api/v1/analytics/performance` | *(No URL parameters)* <br/> Handler: `analyticsController.getAnalyticsPerformance` |
| **GET** | `/api/v1/analytics/health/data` | *(No URL parameters)* <br/> Handler: `analyticsController.getDataHealth` |
| **GET** | `/api/v1/analytics/redis-status` | *(No URL parameters)* <br/> Handler: `analyticsController.getRedisStatus` |

## /api/v1/customeranalytics Routes
*Source Location: /src/routes\v1\customer.analytics.routes.js*

| Method | Endpoint Path | URL Parameters & Route Handler |
|--------|---------------|----------------------------------|
| **GET** | `/api/v1/customeranalytics/overview` | *(No URL parameters)* <br/> Handler: `analyticsController.getCustomerOverview` |
| **GET** | `/api/v1/customeranalytics/financials` | *(No URL parameters)* <br/> Handler: `analyticsController.getCustomerFinancialAnalytics` |
| **GET** | `/api/v1/customeranalytics/payment-behavior` | *(No URL parameters)* <br/> Handler: `analyticsController.getCustomerPaymentBehavior` |
| **GET** | `/api/v1/customeranalytics/ltv` | *(No URL parameters)* <br/> Handler: `analyticsController.getCustomerLifetimeValue` |
| **GET** | `/api/v1/customeranalytics/segmentation` | *(No URL parameters)* <br/> Handler: `analyticsController.getCustomerSegmentation` |
| **GET** | `/api/v1/customeranalytics/geospatial` | *(No URL parameters)* <br/> Handler: `analyticsController.getCustomerGeospatial` |
| **GET** | `/api/v1/customeranalytics/realtime` | *(No URL parameters)* <br/> Handler: `analyticsController.getRealTimeDashboard` |
| **GET** | `/api/v1/customeranalytics/emi` | *(No URL parameters)* <br/> Handler: `analyticsController.getCustomerEMIAnalytics` |
| **GET** | `/api/v1/customeranalytics/export/financials` | *(No URL parameters)* <br/> Handler: `analyticsController.exportFinancialsToCSV` |

## /api/v1/dashboard Routes
*Source Location: /src/routes\v1\dashboard.routes.js*

| Method | Endpoint Path | URL Parameters & Route Handler |
|--------|---------------|----------------------------------|
| **GET** | `/api/v1/dashboard` | *(No URL parameters)* <br/> Handler: `dashboardController.getDashboardOverview` |

## /api/v1/ai-agent Routes
*Source Location: /src/routes\v1\aiAgent.routes.js*

| Method | Endpoint Path | URL Parameters & Route Handler |
|--------|---------------|----------------------------------|
| **POST** | `/api/v1/ai-agent/chat` | *(No URL parameters)* <br/> Handler: `Unknown Controller Method` |

## /api/v1/webhooks Routes
*Source Location: /src/modules\webhook\webhook.routes.js*

| Method | Endpoint Path | URL Parameters & Route Handler |
|--------|---------------|----------------------------------|
| **POST** | `/api/v1/webhooks` | *(No URL parameters)* <br/> Handler: `Unknown Controller Method` |
| **GET** | `/api/v1/webhooks` | *(No URL parameters)* <br/> Handler: `Unknown Controller Method` |
| **PATCH** | `/api/v1/webhooks/:id` | **URL Params:** `id` <br/> Handler: `Unknown Controller Method` |
| **DELETE** | `/api/v1/webhooks/:id` | **URL Params:** `id` <br/> Handler: `Unknown Controller Method` |
| **POST** | `/api/v1/webhooks/:id/test` | **URL Params:** `id` <br/> Handler: `Unknown Controller Method` |
| **GET** | `/api/v1/webhooks/deliveries` | *(No URL parameters)* <br/> Handler: `Unknown Controller Method` |
| **GET** | `/api/v1/webhooks/stats` | *(No URL parameters)* <br/> Handler: `Unknown Controller Method` |
| **POST** | `/api/v1/webhooks/deliveries/:deliveryId/replay` | **URL Params:** `deliveryId` <br/> Handler: `Unknown Controller Method` |

## /api/v1/assets Routes
*Source Location: /src/routes\v1\asset.routes.js*

| Method | Endpoint Path | URL Parameters & Route Handler |
|--------|---------------|----------------------------------|
| **GET** | `/api/v1/assets/stats` | *(No URL parameters)* <br/> Handler: `assetController.getStorageStats` |
| **GET** | `/api/v1/assets` | *(No URL parameters)* <br/> Handler: `Unknown Controller Method` |
| **DELETE** | `/api/v1/assets/:id` | **URL Params:** `id` <br/> Handler: `Unknown Controller Method` |

## /api/v1/notifications Routes
*Source Location: /src/routes\v1\notification.routes.js*

| Method | Endpoint Path | URL Parameters & Route Handler |
|--------|---------------|----------------------------------|
| **GET** | `/api/v1/notifications/stats` | *(No URL parameters)* <br/> Handler: `notificationController.getNotificationStats` |
| **GET** | `/api/v1/notifications/unread-count` | *(No URL parameters)* <br/> Handler: `notificationController.getUnreadCount` |
| **PATCH** | `/api/v1/notifications/mark-read` | *(No URL parameters)* <br/> Handler: `notificationController.markMultipleAsRead` |
| **PATCH** | `/api/v1/notifications/mark-all-read` | *(No URL parameters)* <br/> Handler: `notificationController.markAllRead` |
| **DELETE** | `/api/v1/notifications/clear-all` | *(No URL parameters)* <br/> Handler: `notificationController.clearAll` |
| **GET** | `/api/v1/notifications/stats` | *(No URL parameters)* <br/> Handler: `notificationController.getNotificationStats` |
| **GET** | `/api/v1/notifications/unread-count` | *(No URL parameters)* <br/> Handler: `notificationController.getUnreadCount` |
| **PATCH** | `/api/v1/notifications/mark-read` | *(No URL parameters)* <br/> Handler: `notificationController.markMultipleAsRead` |
| **PATCH** | `/api/v1/notifications/mark-all-read` | *(No URL parameters)* <br/> Handler: `notificationController.markAllRead` |
| **DELETE** | `/api/v1/notifications/clear-all` | *(No URL parameters)* <br/> Handler: `notificationController.clearAll` |
| **GET** | `/api/v1/notifications` | *(No URL parameters)* <br/> Handler: `Unknown Controller Method` |
| **GET** | `/api/v1/notifications/:id` | **URL Params:** `id` <br/> Handler: `Unknown Controller Method` |
| **PATCH** | `/api/v1/notifications/:id` | **URL Params:** `id` <br/> Handler: `notificationController.markAsRead` |
| **DELETE** | `/api/v1/notifications/:id` | **URL Params:** `id` <br/> Handler: `Unknown Controller Method` |
| **GET** | `/api/v1/notifications` | *(No URL parameters)* <br/> Handler: `Unknown Controller Method` |
| **POST** | `/api/v1/notifications` | *(No URL parameters)* <br/> Handler: `notificationController.createNotification` |
| **GET** | `/api/v1/notifications/:id` | **URL Params:** `id` <br/> Handler: `Unknown Controller Method` |
| **PATCH** | `/api/v1/notifications/:id` | **URL Params:** `id` <br/> Handler: `notificationController.markAsRead` |
| **DELETE** | `/api/v1/notifications/:id` | **URL Params:** `id` <br/> Handler: `Unknown Controller Method` |

## /api/v1/announcements Routes
*Source Location: /src/routes\v1\announcement.routes.js*

| Method | Endpoint Path | URL Parameters & Route Handler |
|--------|---------------|----------------------------------|
| **GET** | `/api/v1/announcements/stats` | *(No URL parameters)* <br/> Handler: `announcementController.getAnnouncementStats` |
| **GET** | `/api/v1/announcements/search` | *(No URL parameters)* <br/> Handler: `announcementController.searchAnnouncements` |
| **PATCH** | `/api/v1/announcements/:id/read` | **URL Params:** `id` <br/> Handler: `announcementController.markAsRead` |
| **GET** | `/api/v1/announcements` | *(No URL parameters)* <br/> Handler: `Unknown Controller Method` |
| **POST** | `/api/v1/announcements` | *(No URL parameters)* <br/> Handler: `announcementController.createAnnouncement` |
| **PATCH** | `/api/v1/announcements` | *(No URL parameters)* <br/> Handler: `announcementController.markAsRead` |
| **PATCH** | `/api/v1/announcements/:id` | **URL Params:** `id` <br/> Handler: `announcementController.updateAnnouncement` |
| **DELETE** | `/api/v1/announcements/:id` | **URL Params:** `id` <br/> Handler: `Unknown Controller Method` |

## /api/v1/cron Routes
*Source Location: /src/routes\v1\cron.routes.js*

| Method | Endpoint Path | URL Parameters & Route Handler |
|--------|---------------|----------------------------------|
| **GET** | `/api/v1/cron/status` | *(No URL parameters)* <br/> Handler: `cronController.getCronStatus` |
| **POST** | `/api/v1/cron/:job/trigger` | **URL Params:** `job` <br/> Handler: `cronController.triggerCronJob` |
| **POST** | `/api/v1/cron/stop` | *(No URL parameters)* <br/> Handler: `cronController.stopCronJobs` |

## /api/v1/search Routes
*Source Location: /src/routes\v1\search.routes.js*

| Method | Endpoint Path | URL Parameters & Route Handler |
|--------|---------------|----------------------------------|
| **GET** | `/api/v1/search/global` | *(No URL parameters)* <br/> Handler: `searchController.globalSearch` |
| **GET** | `/api/v1/search/globalchat` | *(No URL parameters)* <br/> Handler: `channelController.globalSearch` |

## /api/v1/chart Routes
*Source Location: /src/routes\v1\chart.routes.js*

| Method | Endpoint Path | URL Parameters & Route Handler |
|--------|---------------|----------------------------------|
| **GET** | `/api/v1/chart/financial-trend` | *(No URL parameters)* <br/> Handler: `chartController.getFinancialTrend` |
| **GET** | `/api/v1/chart/sales-distribution` | *(No URL parameters)* <br/> Handler: `chartController.getSalesDistribution` |
| **GET** | `/api/v1/chart/yoy-growth` | *(No URL parameters)* <br/> Handler: `chartController.getYoYGrowth` |
| **GET** | `/api/v1/chart/branch-radar` | *(No URL parameters)* <br/> Handler: `chartController.getBranchPerformanceRadar` |
| **GET** | `/api/v1/chart/order-funnel` | *(No URL parameters)* <br/> Handler: `chartController.getOrderFunnel` |
| **GET** | `/api/v1/chart/top-performers` | *(No URL parameters)* <br/> Handler: `chartController.getTopPerformers` |
| **GET** | `/api/v1/chart/customer-acquisition` | *(No URL parameters)* <br/> Handler: `chartController.getCustomerAcquisition` |
| **GET** | `/api/v1/chart/aov-trend` | *(No URL parameters)* <br/> Handler: `chartController.getAOVTrend` |
| **GET** | `/api/v1/chart/heatmap` | *(No URL parameters)* <br/> Handler: `chartController.getHeatmap` |

## /api/v1/logs Routes
*Source Location: /src/routes\v1\log.routes.js*

| Method | Endpoint Path | URL Parameters & Route Handler |
|--------|---------------|----------------------------------|
| **GET** | `/api/v1/logs` | *(No URL parameters)* <br/> Handler: `Unknown Controller Method` |

## /api/v1/notes Routes
*Source Location: /src/routes\v1\note.routes.js*

| Method | Endpoint Path | URL Parameters & Route Handler |
|--------|---------------|----------------------------------|
| **POST** | `/api/v1/notes/upload` | *(No URL parameters)* <br/> Handler: `noteController.uploadMedia` |
| **GET** | `/api/v1/notes/search` | *(No URL parameters)* <br/> Handler: `noteController.searchNotes` |
| **GET** | `/api/v1/notes/graph/network` | *(No URL parameters)* <br/> Handler: `noteController.getKnowledgeGraph` |
| **GET** | `/api/v1/notes/analytics/heatmap` | *(No URL parameters)* <br/> Handler: `noteController.getHeatMapData` |
| **GET** | `/api/v1/notes/analytics/summary` | *(No URL parameters)* <br/> Handler: `noteController.getNoteAnalytics` |
| **GET** | `/api/v1/notes/stats/summary` | *(No URL parameters)* <br/> Handler: `noteController.getNoteStatistics` |
| **GET** | `/api/v1/notes/activity/recent` | *(No URL parameters)* <br/> Handler: `noteController.getRecentActivity` |
| **GET** | `/api/v1/notes/calendar/view` | *(No URL parameters)* <br/> Handler: `noteController.getCalendarView` |
| **GET** | `/api/v1/notes/calendar/monthly` | *(No URL parameters)* <br/> Handler: `noteController.getNotesForMonth` |
| **GET** | `/api/v1/notes/export/data` | *(No URL parameters)* <br/> Handler: `noteController.exportNoteData` |
| **GET** | `/api/v1/notes/export/all` | *(No URL parameters)* <br/> Handler: `noteController.exportAllUserNotes` |
| **POST** | `/api/v1/notes/templates` | *(No URL parameters)* <br/> Handler: `noteController.createNoteTemplate` |
| **GET** | `/api/v1/notes/templates` | *(No URL parameters)* <br/> Handler: `noteController.getNoteTemplates` |
| **POST** | `/api/v1/notes/templates/:templateId/create` | **URL Params:** `templateId` <br/> Handler: `noteController.createFromTemplate` |
| **PATCH** | `/api/v1/notes/templates/:templateId` | **URL Params:** `templateId` <br/> Handler: `noteController.updateNoteTemplate` |
| **DELETE** | `/api/v1/notes/templates/:templateId` | **URL Params:** `templateId` <br/> Handler: `noteController.deleteNoteTemplate` |
| **PATCH** | `/api/v1/notes/bulk/update` | *(No URL parameters)* <br/> Handler: `noteController.bulkUpdateNotes` |
| **DELETE** | `/api/v1/notes/bulk/delete` | *(No URL parameters)* <br/> Handler: `noteController.bulkDeleteNotes` |
| **GET** | `/api/v1/notes/trash/bin` | *(No URL parameters)* <br/> Handler: `noteController.getTrash` |
| **POST** | `/api/v1/notes/trash/:id/restore` | **URL Params:** `id` <br/> Handler: `noteController.restoreFromTrash` |
| **DELETE** | `/api/v1/notes/trash/empty` | *(No URL parameters)* <br/> Handler: `noteController.emptyTrash` |
| **POST** | `/api/v1/notes/meetings` | *(No URL parameters)* <br/> Handler: `meetingController.createMeeting` |
| **GET** | `/api/v1/notes/meetings` | *(No URL parameters)* <br/> Handler: `meetingController.getUserMeetings` |
| **GET** | `/api/v1/notes/meetings/:meetingId` | **URL Params:** `meetingId` <br/> Handler: `meetingController.getMeetingById` |
| **PATCH** | `/api/v1/notes/meetings/:meetingId` | **URL Params:** `meetingId` <br/> Handler: `meetingController.updateMeeting` |
| **DELETE** | `/api/v1/notes/meetings/:meetingId/cancel` | **URL Params:** `meetingId` <br/> Handler: `meetingController.cancelMeeting` |
| **POST** | `/api/v1/notes/meetings/:meetingId/rsvp` | **URL Params:** `meetingId` <br/> Handler: `meetingController.meetingRSVP` |
| **POST** | `/api/v1/notes/meetings/:meetingId/join` | **URL Params:** `meetingId` <br/> Handler: `meetingController.joinMeeting` |
| **POST** | `/api/v1/notes/meetings/:meetingId/leave` | **URL Params:** `meetingId` <br/> Handler: `meetingController.leaveMeeting` |
| **POST** | `/api/v1/notes/meetings/:meetingId/participants` | **URL Params:** `meetingId` <br/> Handler: `meetingController.addParticipants` |
| **DELETE** | `/api/v1/notes/meetings/:meetingId/participants/:userId` | **URL Params:** `meetingId`, `userId` <br/> Handler: `meetingController.removeParticipant` |
| **POST** | `/api/v1/notes/meetings/:meetingId/action-items` | **URL Params:** `meetingId` <br/> Handler: `meetingController.addActionItem` |
| **POST** | `/api/v1/notes/meetings/:meetingId/action-items/:actionItemId/convert` | **URL Params:** `meetingId`, `actionItemId` <br/> Handler: `meetingController.convertActionItemToTask` |
| **POST** | `/api/v1/notes/meetings/:meetingId/polls` | **URL Params:** `meetingId` <br/> Handler: `meetingController.createPoll` |
| **POST** | `/api/v1/notes/meetings/:meetingId/polls/:pollId/vote` | **URL Params:** `meetingId`, `pollId` <br/> Handler: `meetingController.votePoll` |
| **GET** | `/api/v1/notes/meetings/analytics/summary` | *(No URL parameters)* <br/> Handler: `meetingController.getMeetingAnalytics` |
| **GET** | `/api/v1/notes/shared/with-me` | *(No URL parameters)* <br/> Handler: `noteController.getSharedNotesWithMe` |
| **GET** | `/api/v1/notes/shared/by-me` | *(No URL parameters)* <br/> Handler: `noteController.getNotesSharedByMe` |
| **GET** | `/api/v1/notes/organization/all` | *(No URL parameters)* <br/> Handler: `noteController.getAllOrganizationNotes` |
| **GET** | `/api/v1/notes` | *(No URL parameters)* <br/> Handler: `noteController.getNotes` |
| **POST** | `/api/v1/notes` | *(No URL parameters)* <br/> Handler: `noteController.createNote` |
| **GET** | `/api/v1/notes/:id/comments` | **URL Params:** `id` <br/> Handler: `noteController.getComments` |
| **POST** | `/api/v1/notes/:id/comments` | **URL Params:** `id` <br/> Handler: `noteController.addComment` |
| **DELETE** | `/api/v1/notes/:id/comments/:commentId` | **URL Params:** `id`, `commentId` <br/> Handler: `noteController.deleteComment` |
| **POST** | `/api/v1/notes/:id/comments/:commentId/react` | **URL Params:** `id`, `commentId` <br/> Handler: `noteController.reactToComment` |
| **POST** | `/api/v1/notes/:id/assign` | **URL Params:** `id` <br/> Handler: `noteController.assignUsers` |
| **PATCH** | `/api/v1/notes/:id/assignment-status` | **URL Params:** `id` <br/> Handler: `noteController.updateAssignmentStatus` |
| **POST** | `/api/v1/notes/:id/checklist` | **URL Params:** `id` <br/> Handler: `noteController.addChecklistItem` |
| **PATCH** | `/api/v1/notes/:id/checklist/:subtaskId` | **URL Params:** `id`, `subtaskId` <br/> Handler: `noteController.toggleSubtask` |
| **DELETE** | `/api/v1/notes/:id/checklist/:subtaskId` | **URL Params:** `id`, `subtaskId` <br/> Handler: `noteController.removeSubtask` |
| **POST** | `/api/v1/notes/:id/subtasks` | **URL Params:** `id` <br/> Handler: `noteController.addSubtask` |
| **PATCH** | `/api/v1/notes/:id/subtasks/:subtaskId` | **URL Params:** `id`, `subtaskId` <br/> Handler: `noteController.toggleSubtask` |
| **DELETE** | `/api/v1/notes/:id/subtasks/:subtaskId` | **URL Params:** `id`, `subtaskId` <br/> Handler: `noteController.removeSubtask` |
| **POST** | `/api/v1/notes/:id/time-log` | **URL Params:** `id` <br/> Handler: `noteController.logTime` |
| **POST** | `/api/v1/notes/:id/share` | **URL Params:** `id` <br/> Handler: `noteController.shareNote` |
| **PATCH** | `/api/v1/notes/:id/share/permissions` | **URL Params:** `id` <br/> Handler: `noteController.updateSharePermissions` |
| **DELETE** | `/api/v1/notes/:id/share/:userId` | **URL Params:** `id`, `userId` <br/> Handler: `noteController.removeUserFromSharedNote` |
| **POST** | `/api/v1/notes/:id/link` | **URL Params:** `id` <br/> Handler: `noteController.linkNote` |
| **POST** | `/api/v1/notes/:id/unlink` | **URL Params:** `id` <br/> Handler: `noteController.unlinkNote` |
| **POST** | `/api/v1/notes/:id/duplicate` | **URL Params:** `id` <br/> Handler: `noteController.duplicateNote` |
| **POST** | `/api/v1/notes/:id/convert-to-task` | **URL Params:** `id` <br/> Handler: `noteController.convertToTask` |
| **PATCH** | `/api/v1/notes/:id/pin` | **URL Params:** `id` <br/> Handler: `noteController.togglePinNote` |
| **PATCH** | `/api/v1/notes/:id/archive` | **URL Params:** `id` <br/> Handler: `noteController.archiveNote` |
| **PATCH** | `/api/v1/notes/:id/restore` | **URL Params:** `id` <br/> Handler: `noteController.restoreNote` |
| **GET** | `/api/v1/notes/:id/history` | **URL Params:** `id` <br/> Handler: `noteController.getNoteHistory` |
| **DELETE** | `/api/v1/notes/:id/permanent` | **URL Params:** `id` <br/> Handler: `noteController.hardDeleteNote` |
| **GET** | `/api/v1/notes/:id` | **URL Params:** `id` <br/> Handler: `noteController.getNoteById` |
| **PATCH** | `/api/v1/notes/:id` | **URL Params:** `id` <br/> Handler: `noteController.updateNote` |
| **DELETE** | `/api/v1/notes/:id` | **URL Params:** `id` <br/> Handler: `noteController.deleteNote` |

## /api/v1/chat Routes
*Source Location: /src/routes\v1\chat.routes.js*

| Method | Endpoint Path | URL Parameters & Route Handler |
|--------|---------------|----------------------------------|
| **GET** | `/api/v1/chat/channels` | *(No URL parameters)* <br/> Handler: `Unknown Controller Method` |
| **POST** | `/api/v1/chat/channels` | *(No URL parameters)* <br/> Handler: `Unknown Controller Method` |
| **POST** | `/api/v1/chat/messages` | *(No URL parameters)* <br/> Handler: `Unknown Controller Method` |
| **POST** | `/api/v1/chat/upload` | *(No URL parameters)* <br/> Handler: `Unknown Controller Method` |
| **GET** | `/api/v1/chat/channels/:channelId/messages` | **URL Params:** `channelId` <br/> Handler: `Unknown Controller Method` |
| **POST** | `/api/v1/chat/channels/:channelId/members` | **URL Params:** `channelId` <br/> Handler: `Unknown Controller Method` |
| **DELETE** | `/api/v1/chat/channels/:channelId/members/:userId` | **URL Params:** `channelId`, `userId` <br/> Handler: `Unknown Controller Method` |
| **POST** | `/api/v1/chat/channels/:channelId/leave` | **URL Params:** `channelId` <br/> Handler: `Unknown Controller Method` |
| **PATCH** | `/api/v1/chat/channels/:channelId/disable` | **URL Params:** `channelId` <br/> Handler: `Unknown Controller Method` |
| **PATCH** | `/api/v1/chat/channels/:channelId/enable` | **URL Params:** `channelId` <br/> Handler: `Unknown Controller Method` |
| **PATCH** | `/api/v1/chat/messages/:messageId` | **URL Params:** `messageId` <br/> Handler: `Unknown Controller Method` |
| **DELETE** | `/api/v1/chat/messages/:messageId` | **URL Params:** `messageId` <br/> Handler: `Unknown Controller Method` |
| **PATCH** | `/api/v1/chat/messages/:messageId/read` | **URL Params:** `messageId` <br/> Handler: `Unknown Controller Method` |

## /api/v1/feed Routes
*Source Location: /src/routes\v1\feed.routes.js*

| Method | Endpoint Path | URL Parameters & Route Handler |
|--------|---------------|----------------------------------|
| **GET** | `/api/v1/feed/customer/:customerId` | **URL Params:** `customerId` <br/> Handler: `feedController.getCustomerFeed` |

## /api/v1/hrms Routes
*Source Location: /src/modules\HRMS\routes\index*

| Method | Endpoint Path | URL Parameters & Route Handler |
|--------|---------------|----------------------------------|
| - | - | *Route file not found at path* |

## /api/v1/store Routes
*Source Location: /src/PublicModules\routes\storefront\public.routes.js*

| Method | Endpoint Path | URL Parameters & Route Handler |
|--------|---------------|----------------------------------|
| **GET** | `/api/v1/store/:organizationSlug` | **URL Params:** `organizationSlug` <br/> Handler: `storefrontPublicController.getOrganizationInfo` |
| **GET** | `/api/v1/store/:organizationSlug/sitemap` | **URL Params:** `organizationSlug` <br/> Handler: `storefrontPublicController.getSitemap` |
| **GET** | `/api/v1/store/:organizationSlug/meta` | **URL Params:** `organizationSlug` <br/> Handler: `productPublicController.getStoreMetadata` |
| **GET** | `/api/v1/store/:organizationSlug/filters` | **URL Params:** `organizationSlug` <br/> Handler: `productPublicController.getShopFilters` |
| **GET** | `/api/v1/store/:organizationSlug/search` | **URL Params:** `organizationSlug` <br/> Handler: `productPublicController.searchProducts` |
| **GET** | `/api/v1/store/:organizationSlug/categories` | **URL Params:** `organizationSlug` <br/> Handler: `productPublicController.getCategories` |
| **GET** | `/api/v1/store/:organizationSlug/brands` | **URL Params:** `organizationSlug` <br/> Handler: `productPublicController.getBrands` |
| **GET** | `/api/v1/store/:organizationSlug/tags` | **URL Params:** `organizationSlug` <br/> Handler: `productPublicController.getTags` |
| **GET** | `/api/v1/store/:organizationSlug/products` | **URL Params:** `organizationSlug` <br/> Handler: `productPublicController.getProducts` |
| **GET** | `/api/v1/store/:organizationSlug/products/:productSlug` | **URL Params:** `organizationSlug`, `productSlug` <br/> Handler: `productPublicController.getProductBySlug` |
| **GET** | `/api/v1/store/:organizationSlug/cart` | **URL Params:** `organizationSlug` <br/> Handler: `cartController.getCart` |
| **POST** | `/api/v1/store/:organizationSlug/cart/items` | **URL Params:** `organizationSlug` <br/> Handler: `cartController.addItem` |
| **PATCH** | `/api/v1/store/:organizationSlug/cart/items/:cartItemId` | **URL Params:** `organizationSlug`, `cartItemId` <br/> Handler: `cartController.updateItemQuantity` |
| **DELETE** | `/api/v1/store/:organizationSlug/cart/items/:cartItemId` | **URL Params:** `organizationSlug`, `cartItemId` <br/> Handler: `cartController.removeItem` |
| **DELETE** | `/api/v1/store/:organizationSlug/cart` | **URL Params:** `organizationSlug` <br/> Handler: `cartController.clearCart` |
| **GET** | `/api/v1/store/:organizationSlug/cart/validate` | **URL Params:** `organizationSlug` <br/> Handler: `cartController.validateCart` |
| **POST** | `/api/v1/store/:organizationSlug/cart/merge` | **URL Params:** `organizationSlug` <br/> Handler: `cartController.mergeCart` |
| **GET** | `/api/v1/store/:organizationSlug/:pageSlug` | **URL Params:** `organizationSlug`, `pageSlug` <br/> Handler: `storefrontPublicController.getPublicPage` |
| **GET** | `/api/v1/store` | *(No URL parameters)* <br/> Handler: `Unknown Controller Method` |
| **GET** | `/api/v1/store/:organizationSlug` | **URL Params:** `organizationSlug` <br/> Handler: `storefrontPublicController.getOrganizationInfo` |
| **GET** | `/api/v1/store/:organizationSlug/sitemap` | **URL Params:** `organizationSlug` <br/> Handler: `storefrontPublicController.getSitemap` |
| **GET** | `/api/v1/store/:organizationSlug/meta` | **URL Params:** `organizationSlug` <br/> Handler: `productPublicController.getStoreMetadata` |
| **GET** | `/api/v1/store/:organizationSlug/products` | **URL Params:** `organizationSlug` <br/> Handler: `productPublicController.getProducts` |
| **GET** | `/api/v1/store/:organizationSlug/products/:productSlug` | **URL Params:** `organizationSlug`, `productSlug` <br/> Handler: `productPublicController.getProductBySlug` |
| **GET** | `/api/v1/store/:organizationSlug/categories` | **URL Params:** `organizationSlug` <br/> Handler: `productPublicController.getCategories` |
| **GET** | `/api/v1/store/:organizationSlug/tags` | **URL Params:** `organizationSlug` <br/> Handler: `productPublicController.getTags` |
| **GET** | `/api/v1/store/:organizationSlug/search` | **URL Params:** `organizationSlug` <br/> Handler: `productPublicController.searchProducts` |
| **GET** | `/api/v1/store/:organizationSlug/:pageSlug` | **URL Params:** `organizationSlug`, `pageSlug` <br/> Handler: `storefrontPublicController.getPublicPage` |
| **GET** | `/api/v1/store` | *(No URL parameters)* <br/> Handler: `Unknown Controller Method` |

## /api/v1/admin/storefront Routes
*Source Location: /src/PublicModules\routes\storefront\admin.routes.js*

| Method | Endpoint Path | URL Parameters & Route Handler |
|--------|---------------|----------------------------------|
| **DELETE** | `/api/v1/admin/storefront/layout/reset` | *(No URL parameters)* <br/> Handler: `layoutAdminController.resetLayout` |
| **GET** | `/api/v1/admin/storefront/themes` | *(No URL parameters)* <br/> Handler: `storefrontAdminController.getAvailableThemes` |
| **GET** | `/api/v1/admin/storefront/sections` | *(No URL parameters)* <br/> Handler: `storefrontAdminController.getSectionTypes` |
| **GET** | `/api/v1/admin/storefront/section-types` | *(No URL parameters)* <br/> Handler: `storefrontAdminController.getSectionTypes` |
| **GET** | `/api/v1/admin/storefront/templates` | *(No URL parameters)* <br/> Handler: `storefrontAdminController.getTemplates` |
| **POST** | `/api/v1/admin/storefront/pages/:pageId/publish` | **URL Params:** `pageId` <br/> Handler: `storefrontAdminController.publishPage` |
| **POST** | `/api/v1/admin/storefront/pages/:pageId/unpublish` | **URL Params:** `pageId` <br/> Handler: `storefrontAdminController.unpublishPage` |
| **POST** | `/api/v1/admin/storefront/pages/:pageId/set-homepage` | **URL Params:** `pageId` <br/> Handler: `storefrontAdminController.setHomepage` |
| **POST** | `/api/v1/admin/storefront/pages/:pageId/duplicate` | **URL Params:** `pageId` <br/> Handler: `storefrontAdminController.duplicatePage` |
| **GET** | `/api/v1/admin/storefront/pages/:pageId/analytics` | **URL Params:** `pageId` <br/> Handler: `storefrontAdminController.getPageAnalytics` |
| **POST** | `/api/v1/admin/storefront/rules/preview` | *(No URL parameters)* <br/> Handler: `smartRuleController.previewRule` |
| **POST** | `/api/v1/admin/storefront/rules/:ruleId/execute` | **URL Params:** `ruleId` <br/> Handler: `smartRuleController.executeRule` |
| **POST** | `/api/v1/admin/storefront/rules/:ruleId/clear-cache` | **URL Params:** `ruleId` <br/> Handler: `smartRuleController.clearCache` |
| **DELETE** | `/api/v1/admin/storefront/rules/:ruleId/cache` | **URL Params:** `ruleId` <br/> Handler: `smartRuleController.clearCache` |
| **GET** | `/api/v1/admin/storefront/themes` | *(No URL parameters)* <br/> Handler: `storefrontAdminController.getAvailableThemes` |
| **POST** | `/api/v1/admin/storefront/pages/:pageId/publish` | **URL Params:** `pageId` <br/> Handler: `storefrontAdminController.publishPage` |
| **POST** | `/api/v1/admin/storefront/pages/:pageId/unpublish` | **URL Params:** `pageId` <br/> Handler: `storefrontAdminController.unpublishPage` |
| **POST** | `/api/v1/admin/storefront/pages/:pageId/duplicate` | **URL Params:** `pageId` <br/> Handler: `storefrontAdminController.duplicatePage` |
| **GET** | `/api/v1/admin/storefront/sections` | *(No URL parameters)* <br/> Handler: `storefrontAdminController.getSectionTypes` |
| **GET** | `/api/v1/admin/storefront/templates` | *(No URL parameters)* <br/> Handler: `storefrontAdminController.getTemplates` |
| **GET** | `/api/v1/admin/storefront/pages/:pageId/analytics` | **URL Params:** `pageId` <br/> Handler: `storefrontAdminController.getPageAnalytics` |
| **GET** | `/api/v1/admin/storefront/layout` | *(No URL parameters)* <br/> Handler: `Unknown Controller Method` |
| **PUT** | `/api/v1/admin/storefront/layout` | *(No URL parameters)* <br/> Handler: `layoutAdminController.updateLayout` |
| **DELETE** | `/api/v1/admin/storefront/layout` | *(No URL parameters)* <br/> Handler: `layoutAdminController.resetLayout` |
| **GET** | `/api/v1/admin/storefront/layout` | *(No URL parameters)* <br/> Handler: `Unknown Controller Method` |
| **GET** | `/api/v1/admin/storefront/layout` | *(No URL parameters)* <br/> Handler: `Unknown Controller Method` |
| **GET** | `/api/v1/admin/storefront/layout` | *(No URL parameters)* <br/> Handler: `Unknown Controller Method` |
| **GET** | `/api/v1/admin/storefront/layout` | *(No URL parameters)* <br/> Handler: `Unknown Controller Method` |
| **GET** | `/api/v1/admin/storefront/pages` | *(No URL parameters)* <br/> Handler: `Unknown Controller Method` |
| **POST** | `/api/v1/admin/storefront/pages` | *(No URL parameters)* <br/> Handler: `storefrontAdminController.createPage` |
| **GET** | `/api/v1/admin/storefront/pages/:pageId` | **URL Params:** `pageId` <br/> Handler: `Unknown Controller Method` |
| **PUT** | `/api/v1/admin/storefront/pages/:pageId` | **URL Params:** `pageId` <br/> Handler: `storefrontAdminController.updatePage` |
| **DELETE** | `/api/v1/admin/storefront/pages/:pageId` | **URL Params:** `pageId` <br/> Handler: `Unknown Controller Method` |
| **POST** | `/api/v1/admin/storefront/pages/:pageId` | **URL Params:** `pageId` <br/> Handler: `storefrontAdminController.publishPage` |
| **POST** | `/api/v1/admin/storefront/pages/:pageId` | **URL Params:** `pageId` <br/> Handler: `storefrontAdminController.unpublishPage` |
| **POST** | `/api/v1/admin/storefront/pages/:pageId` | **URL Params:** `pageId` <br/> Handler: `storefrontAdminController.setHomepage` |
| **POST** | `/api/v1/admin/storefront/pages/:pageId` | **URL Params:** `pageId` <br/> Handler: `storefrontAdminController.duplicatePage` |
| **GET** | `/api/v1/admin/storefront/pages/:pageId` | **URL Params:** `pageId` <br/> Handler: `Unknown Controller Method` |
| **GET** | `/api/v1/admin/storefront/rules` | *(No URL parameters)* <br/> Handler: `Unknown Controller Method` |
| **POST** | `/api/v1/admin/storefront/rules` | *(No URL parameters)* <br/> Handler: `smartRuleController.createRule` |
| **POST** | `/api/v1/admin/storefront/rules` | *(No URL parameters)* <br/> Handler: `smartRuleController.previewRule` |
| **GET** | `/api/v1/admin/storefront/rules/:ruleId` | **URL Params:** `ruleId` <br/> Handler: `Unknown Controller Method` |
| **PUT** | `/api/v1/admin/storefront/rules/:ruleId` | **URL Params:** `ruleId` <br/> Handler: `smartRuleController.updateRule` |
| **DELETE** | `/api/v1/admin/storefront/rules/:ruleId` | **URL Params:** `ruleId` <br/> Handler: `Unknown Controller Method` |
| **POST** | `/api/v1/admin/storefront/rules/:ruleId` | **URL Params:** `ruleId` <br/> Handler: `smartRuleController.executeRule` |
| **POST** | `/api/v1/admin/storefront/rules/:ruleId` | **URL Params:** `ruleId` <br/> Handler: `smartRuleController.clearCache` |
| **DELETE** | `/api/v1/admin/storefront/rules/:ruleId` | **URL Params:** `ruleId` <br/> Handler: `smartRuleController.clearCache` |
| **GET** | `/api/v1/admin/storefront/layout` | *(No URL parameters)* <br/> Handler: `Unknown Controller Method` |
| **PUT** | `/api/v1/admin/storefront/layout` | *(No URL parameters)* <br/> Handler: `storefrontAdminController.updateLayout` |
| **GET** | `/api/v1/admin/storefront/pages` | *(No URL parameters)* <br/> Handler: `Unknown Controller Method` |
| **POST** | `/api/v1/admin/storefront/pages` | *(No URL parameters)* <br/> Handler: `storefrontAdminController.createPage` |
| **GET** | `/api/v1/admin/storefront/pages` | *(No URL parameters)* <br/> Handler: `Unknown Controller Method` |
| **GET** | `/api/v1/admin/storefront/pages/:pageId` | **URL Params:** `pageId` <br/> Handler: `Unknown Controller Method` |
| **PUT** | `/api/v1/admin/storefront/pages/:pageId` | **URL Params:** `pageId` <br/> Handler: `storefrontAdminController.updatePage` |
| **DELETE** | `/api/v1/admin/storefront/pages/:pageId` | **URL Params:** `pageId` <br/> Handler: `Unknown Controller Method` |
| **POST** | `/api/v1/admin/storefront/pages/:pageId` | **URL Params:** `pageId` <br/> Handler: `storefrontAdminController.publishPage` |
| **POST** | `/api/v1/admin/storefront/pages/:pageId` | **URL Params:** `pageId` <br/> Handler: `storefrontAdminController.unpublishPage` |
| **POST** | `/api/v1/admin/storefront/pages/:pageId` | **URL Params:** `pageId` <br/> Handler: `storefrontAdminController.duplicatePage` |
| **GET** | `/api/v1/admin/storefront/pages/:pageId` | **URL Params:** `pageId` <br/> Handler: `Unknown Controller Method` |
| **GET** | `/api/v1/admin/storefront/pages/:pageId` | **URL Params:** `pageId` <br/> Handler: `Unknown Controller Method` |
| **GET** | `/api/v1/admin/storefront/pages/:pageId` | **URL Params:** `pageId` <br/> Handler: `Unknown Controller Method` |

## /api/v1/admin/storefront/smart-rules Routes
*Source Location: /src/PublicModules\routes\storefront\smartRule.routes.js*

| Method | Endpoint Path | URL Parameters & Route Handler |
|--------|---------------|----------------------------------|
| **POST** | `/api/v1/admin/storefront/smart-rules/preview` | *(No URL parameters)* <br/> Handler: `smartRuleController.previewRule` |
| **POST** | `/api/v1/admin/storefront/smart-rules/:ruleId/execute` | **URL Params:** `ruleId` <br/> Handler: `smartRuleController.executeRule` |
| **POST** | `/api/v1/admin/storefront/smart-rules/:ruleId/clear-cache` | **URL Params:** `ruleId` <br/> Handler: `smartRuleController.clearCache` |
| **DELETE** | `/api/v1/admin/storefront/smart-rules/:ruleId/cache` | **URL Params:** `ruleId` <br/> Handler: `smartRuleController.clearCache` |
| **GET** | `/api/v1/admin/storefront/smart-rules/:ruleId/execute` | **URL Params:** `ruleId` <br/> Handler: `smartRuleController.executeRule` |
| **POST** | `/api/v1/admin/storefront/smart-rules/preview` | *(No URL parameters)* <br/> Handler: `smartRuleController.previewRule` |
| **GET** | `/api/v1/admin/storefront/smart-rules/:ruleId/analytics` | **URL Params:** `ruleId` <br/> Handler: `smartRuleController.getRuleAnalytics` |
| **POST** | `/api/v1/admin/storefront/smart-rules/template` | *(No URL parameters)* <br/> Handler: `smartRuleController.createFromTemplate` |
| **DELETE** | `/api/v1/admin/storefront/smart-rules/:ruleId/cache` | **URL Params:** `ruleId` <br/> Handler: `smartRuleController.clearCache` |
| **GET** | `/api/v1/admin/storefront/smart-rules` | *(No URL parameters)* <br/> Handler: `Unknown Controller Method` |
| **POST** | `/api/v1/admin/storefront/smart-rules` | *(No URL parameters)* <br/> Handler: `smartRuleController.createRule` |
| **POST** | `/api/v1/admin/storefront/smart-rules` | *(No URL parameters)* <br/> Handler: `smartRuleController.previewRule` |
| **GET** | `/api/v1/admin/storefront/smart-rules/:ruleId` | **URL Params:** `ruleId` <br/> Handler: `Unknown Controller Method` |
| **PUT** | `/api/v1/admin/storefront/smart-rules/:ruleId` | **URL Params:** `ruleId` <br/> Handler: `smartRuleController.updateRule` |
| **DELETE** | `/api/v1/admin/storefront/smart-rules/:ruleId` | **URL Params:** `ruleId` <br/> Handler: `Unknown Controller Method` |
| **POST** | `/api/v1/admin/storefront/smart-rules/:ruleId` | **URL Params:** `ruleId` <br/> Handler: `smartRuleController.executeRule` |
| **POST** | `/api/v1/admin/storefront/smart-rules/:ruleId` | **URL Params:** `ruleId` <br/> Handler: `smartRuleController.clearCache` |
| **DELETE** | `/api/v1/admin/storefront/smart-rules/:ruleId` | **URL Params:** `ruleId` <br/> Handler: `smartRuleController.clearCache` |
| **GET** | `/api/v1/admin/storefront/smart-rules` | *(No URL parameters)* <br/> Handler: `Unknown Controller Method` |
| **POST** | `/api/v1/admin/storefront/smart-rules` | *(No URL parameters)* <br/> Handler: `smartRuleController.createRule` |
| **GET** | `/api/v1/admin/storefront/smart-rules/:ruleId` | **URL Params:** `ruleId` <br/> Handler: `Unknown Controller Method` |
| **PUT** | `/api/v1/admin/storefront/smart-rules/:ruleId` | **URL Params:** `ruleId` <br/> Handler: `smartRuleController.updateRule` |
| **DELETE** | `/api/v1/admin/storefront/smart-rules/:ruleId` | **URL Params:** `ruleId` <br/> Handler: `Unknown Controller Method` |
| **GET** | `/api/v1/admin/storefront/smart-rules/:ruleId` | **URL Params:** `ruleId` <br/> Handler: `smartRuleController.executeRule` |
| **POST** | `/api/v1/admin/storefront/smart-rules/:ruleId` | **URL Params:** `ruleId` <br/> Handler: `smartRuleController.previewRule` |
| **GET** | `/api/v1/admin/storefront/smart-rules/:ruleId` | **URL Params:** `ruleId` <br/> Handler: `Unknown Controller Method` |
| **POST** | `/api/v1/admin/storefront/smart-rules/:ruleId` | **URL Params:** `ruleId` <br/> Handler: `smartRuleController.createFromTemplate` |
| **DELETE** | `/api/v1/admin/storefront/smart-rules/:ruleId` | **URL Params:** `ruleId` <br/> Handler: `smartRuleController.clearCache` |

