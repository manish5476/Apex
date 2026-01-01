# ======================================================
# APEX CRM - MODULAR MIGRATION SCRIPT
# Creates newSrc/ with modular structure from src/
# ======================================================

$ErrorActionPreference = "Stop"

# Color functions for better output
function Write-Info { Write-Host "[INFO] $args" -ForegroundColor Cyan }
function Write-Success { Write-Host "[SUCCESS] $args" -ForegroundColor Green }
function Write-Warning { Write-Host "[WARNING] $args" -ForegroundColor Yellow }
function Write-Error { Write-Host "[ERROR] $args" -ForegroundColor Red }
function Write-Detail { Write-Host "  $args" -ForegroundColor Gray }

# -------------------------------
# CHECK AND PREPARE
# -------------------------------
Write-Info "Starting Modular Migration"

if (Test-Path "newSrc") {
    Write-Warning "newSrc already exists"
    $choice = Read-Host "Choose: (O)verwrite, (B)ackup, (C)ancel [O/B/C]"
    
    switch ($choice.ToUpper()) {
        "O" {
            Write-Warning "Overwriting newSrc..."
            Remove-Item -Path "newSrc" -Recurse -Force
        }
        "B" {
            $timestamp = Get-Date -Format "yyyyMMdd_HHmmss"
            $backupName = "newSrc_backup_$timestamp"
            Write-Info "Backing up to: $backupName"
            Rename-Item -Path "newSrc" -NewName $backupName
        }
        default {
            Write-Error "Migration cancelled"
            exit 1
        }
    }
}

# -------------------------------
# CREATE MODULAR DIRECTORY STRUCTURE
# -------------------------------
Write-Info "Creating modular directory structure..."

$moduleStructure = @(
    # Core framework
    "newSrc",
    "newSrc/bootstrap",
    "newSrc/config",
    "newSrc/core/error",
    "newSrc/core/middleware",
    "newSrc/core/utils",
    "newSrc/core/utils/_legacy",
    "newSrc/core/jobs",
    "newSrc/core/jobs/_legacy",
    
    # Business Modules
    "newSrc/modules/accounting/core",
    "newSrc/modules/accounting/billing",
    "newSrc/modules/accounting/payments",
    "newSrc/modules/accounting/reports",
    "newSrc/modules/accounting/ledger",
    "newSrc/modules/accounting/transactions",
    
    "newSrc/modules/hr/attendance",
    "newSrc/modules/hr/attendance/models",
    "newSrc/modules/hr/holiday",
    "newSrc/modules/hr/shift",
    "newSrc/modules/hr/leave",
    "newSrc/modules/hr/payroll",
    
    "newSrc/modules/inventory/core",
    "newSrc/modules/inventory/products",
    "newSrc/modules/inventory/sales",
    "newSrc/modules/inventory/purchases",
    "newSrc/modules/inventory/stock",
    "newSrc/modules/inventory/returns",
    
    "newSrc/modules/organization/core",
    "newSrc/modules/organization/branches",
    "newSrc/modules/organization/customers",
    "newSrc/modules/organization/suppliers",
    "newSrc/modules/organization/channels",
    
    "newSrc/modules/auth/core",
    "newSrc/modules/auth/roles",
    "newSrc/modules/auth/sessions",
    "newSrc/modules/auth/users",
    
    "newSrc/modules/notification/core",
    "newSrc/modules/notification/announcements",
    "newSrc/modules/notification/messages",
    "newSrc/modules/notification/feeds",
    
    "newSrc/modules/master/core",
    "newSrc/modules/master/types",
    "newSrc/modules/master/lists",
    
    "newSrc/modules/analytics/dashboard",
    "newSrc/modules/analytics/reports",
    "newSrc/modules/analytics/charts",
    "newSrc/modules/analytics/insights",
    
    "newSrc/modules/communication/channels",
    "newSrc/modules/communication/feeds",
    
    "newSrc/modules/admin/core",
    "newSrc/modules/admin/monitoring",
    "newSrc/modules/admin/logs",
    "newSrc/modules/admin/automation",
    
    "newSrc/modules/utilities/uploads",
    "newSrc/modules/utilities/ai",
    "newSrc/modules/utilities/search",
    "newSrc/modules/utilities/notes",
    
    # Legacy for unmapped files
    "newSrc/modules/_legacy/controllers",
    "newSrc/modules/_legacy/services",
    "newSrc/modules/_legacy/models",
    
    # Supporting directories
    "newSrc/routes",
    "newSrc/routes/v1",
    "newSrc/shared/middleware",
    "newSrc/shared/validations",
    "newSrc/shared/utils",
    "newSrc/scripts",
    "newSrc/public",
    "newSrc/public/fonts",
    "newSrc/logs",
    "newSrc/tests",
    "newSrc/tests/unit",
    "newSrc/tests/integration",
    "newSrc/socketHandlers"
)

foreach ($dir in $moduleStructure) {
    if (-not (Test-Path $dir)) {
        New-Item -ItemType Directory -Path $dir -Force | Out-Null
        Write-Detail "Created: $dir"
    }
}

Write-Success "Directory structure created"

# -------------------------------
# MIGRATE ROOT FILES
# -------------------------------
Write-Info "Migrating root files..."

$rootFiles = @(".env", ".env.example", ".gitignore", "app.js", "debug-ai.js", "server.js")
foreach ($file in $rootFiles) {
    if (Test-Path "src\$file") {
        Copy-Item "src\$file" "newSrc\$file"
        Write-Detail "Root: $file"
    }
}

# -------------------------------
# MIGRATE CONFIG/BOOTSTRAP FILES
# -------------------------------
Write-Info "Migrating config files..."

$configFiles = @(
    @("config\db.js", "bootstrap\db.js"),
    @("config\logger.js", "bootstrap\logger.js"),
    @("config\swaggerConfig.js", "bootstrap\swagger.js"),
    @("config\permissions.js", "config\permissions.js"),
    @("config\redis.js", "config\redis.js"),
    @("config\middlewareConfig.js", "config\middlewareConfig.js")
)

foreach ($pair in $configFiles) {
    $src = "src\$($pair[0])"
    $dest = "newSrc\$($pair[1])"
    if (Test-Path $src) {
        Copy-Item $src $dest
        Write-Detail "Config: $($pair[0]) -> $($pair[1])"
    }
}

# -------------------------------
# MIGRATE CORE FILES
# -------------------------------
Write-Info "Migrating core files..."

# Error handling
Copy-Item "src\middleware\errorHandler.js" "newSrc\core\error\errorHandler.js" -ErrorAction SilentlyContinue
Copy-Item "src\middleware\errorController.js" "newSrc\core\error\errorController.js" -ErrorAction SilentlyContinue

# Core middleware
$middlewareMap = @{
    "authMiddleware.js" = "auth.middleware.js"
    "permissionMiddleware.js" = "permission.middleware.js"
    "cacheMiddleware.js" = "cache.middleware.js"
    "sessionActivity.js" = "session.middleware.js"
    "periodLock.js" = "periodLock.middleware.js"
    "forgotPasswordLimiter.js" = "rateLimit.middleware.js"
    "assignRequestId.js" = "requestId.middleware.js"
    "security.js" = "security.middleware.js"
    "stockValidationMiddleware.js" = "stockValidation.middleware.js"
    "routeManager.js" = "routeManager.middleware.js"
    "uploadMiddleware.js" = "upload.middleware.js"
}

foreach ($oldName in $middlewareMap.Keys) {
    $src = "src\middleware\$oldName"
    $newName = $middlewareMap[$oldName]
    $dest = "newSrc\core\middleware\$newName"
    
    if (Test-Path $src) {
        Copy-Item $src $dest
        Write-Detail "Middleware: $oldName -> $newName"
    }
}

# Multer config
if (Test-Path "src\middleware\multerConfig.js") {
    Copy-Item "src\middleware\multerConfig.js" "newSrc\core\utils\_legacy\multerConfig.js"
    Write-Detail "Middleware: multerConfig.js -> core/utils/_legacy"
}

# Core utilities - keep original names for handleFactorynew.js and newApiFeatures.js
$coreUtils = @("appError.js", "catchAsync.js", "ApiFeatures.js", "runInTransaction.js", 
               "auditLogger.js", "authUtils.js", "handlerFactory.js", "socket.js", 
               "newApiFeatures.js", "parseJson.js", "redis.js", "txnLogger.js",
               "transactionLogger.js", "calendar.utils.js", "date.utils.js",
               "cache.js", "email.js", "geocoder.js", "cron.js", 
               "announcementCron.js", "emiReminderCron.js")

foreach ($util in $coreUtils) {
    if (Test-Path "src\utils\$util") {
        Copy-Item "src\utils\$util" "newSrc\core\utils\$util"
        Write-Detail "Core util: $util"
    }
}

# Handle Factory - Keep original name
if (Test-Path "src\utils\handleFactorynew.js") {
    Copy-Item "src\utils\handleFactorynew.js" "newSrc\core\utils\handleFactorynew.js"
    Write-Detail "Core util: handleFactorynew.js (keeping original name)"
}

# Template files (not directory)
if (Test-Path "src\utils\invoiceEmailTemplate.js") {
    Copy-Item "src\utils\invoiceEmailTemplate.js" "newSrc\core\utils\_legacy\invoiceEmailTemplate.js"
    Write-Detail "Template: invoiceEmailTemplate.js -> core/utils/_legacy"
}

if (Test-Path "src\utils\invoiceTemplate.js") {
    Copy-Item "src\utils\invoiceTemplate.js" "newSrc\core\utils\_legacy\invoiceTemplate.js"
    Write-Detail "Template: invoiceTemplate.js -> core/utils/_legacy"
}

if (Test-Path "src\utils\paymentSlipTemplate.js") {
    Copy-Item "src\utils\paymentSlipTemplate.js" "newSrc\core\utils\_legacy\paymentSlipTemplate.js"
    Write-Detail "Template: paymentSlipTemplate.js -> core/utils/_legacy"
}

# Jobs
if (Test-Path "src\jobs") {
    Copy-Item "src\jobs\*" "newSrc\core\jobs\" -Recurse -Force
    Write-Detail "Jobs: Copied jobs folder"
}

# -------------------------------
# MODULE 1: ACCOUNTING
# -------------------------------
Write-Info "Migrating Accounting Module..."

# Accounting Models
$accountingModels = @(
    @("accountModel.js", "core/account.model.js"),
    @("accountEntryModel.js", "core/accountEntry.model.js"),
    @("invoiceModel.js", "billing/invoice.model.js"),
    @("invoiceAuditModel.js", "billing/invoiceAudit.model.js"),
    @("paymentModel.js", "payments/payment.model.js"),
    @("emiModel.js", "payments/emi.model.js"),
    @("pendingReconciliationModel.js", "reports/reconciliation.model.js")
)

foreach ($pair in $accountingModels) {
    $src = "src\models\$($pair[0])"
    $dest = "newSrc\modules\accounting\$($pair[1])"
    if (Test-Path $src) {
        Copy-Item $src $dest
        Write-Detail "Accounting Model: $($pair[0])"
    }
}

# Accounting Controllers
$accountingControllers = @(
    @("accountController.js", "core/account.controller.js"),
    @("ledgerController.js", "ledger/ledger.controller.js"),
    @("transactionController.js", "transactions/transaction.controller.js"),
    @("reconciliationController.js", "reports/reconciliation.controller.js"),
    @("invoiceController.js", "billing/invoice.controller.js"),
    @("invoicePDFController.js", "billing/invoicePDF.controller.js"),
    @("paymentController.js", "payments/payment.controller.js"),
    @("emiController.js", "payments/emi.controller.js"),
    @("partyTransactionController.js", "transactions/partyTransaction.controller.js"),
    @("statementsController.js", "reports/statements.controller.js")
)

foreach ($pair in $accountingControllers) {
    $src = "src\controllers\$($pair[0])"
    $dest = "newSrc\modules\accounting\$($pair[1])"
    if (Test-Path $src) {
        Copy-Item $src $dest
        Write-Detail "Accounting Controller: $($pair[0])"
    }
}

# Accounting Services
$accountingServices = @(
    @("accountService.js", "core/account.service.js"),
    @("accountingService.js", "core/accounting.service.js"),
    @("journalService.js", "core/journal.service.js"),
    @("transactionService.js", "transactions/transaction.service.js"),
    @("ledgerCache.js", "ledger/ledgerCache.service.js"),
    @("invoicePDFService.js", "billing/invoicePDF.service.js"),
    @("paymentPDFService.js", "payments/paymentPDF.service.js"),
    @("payrollService.js", "payments/payroll.service.js"),
    @("emiService.js", "payments/emi.service.js"),
    @("statementsService.js", "reports/statements.service.js")
)

foreach ($pair in $accountingServices) {
    $src = "src\services\$($pair[0])"
    $dest = "newSrc\modules\accounting\$($pair[1])"
    if (Test-Path $src) {
        Copy-Item $src $dest
        Write-Detail "Accounting Service: $($pair[0])"
    }
}

# -------------------------------
# MODULE 2: HR
# -------------------------------
Write-Info "Migrating HR Module..."

# HR Models
$hrModels = @(
    @("attendanceDailyModel.js", "attendance/models/attendanceDaily.model.js"),
    @("attendanceLogModel.js", "attendance/models/attendanceLog.model.js"),
    @("attendanceMachineModel.js", "attendance/models/attendanceMachine.model.js"),
    @("attendanceRequestModel.js", "attendance/models/attendanceRequest.model.js"),
    @("attendanceSummaryModel.js", "attendance/models/attendanceSummary.model.js"),
    @("holidayModel.js", "holiday/holiday.model.js"),
    @("shiftModel.js", "shift/shift.model.js"),
    @("leaveRequestModel.js", "leave/leaveRequest.model.js")
)

foreach ($pair in $hrModels) {
    $src = "src\models\$($pair[0])"
    $dest = "newSrc\modules\hr\$($pair[1])"
    if (Test-Path $src) {
        Copy-Item $src $dest
        Write-Detail "HR Model: $($pair[0])"
    }
}

# HR Controllers
$hrControllers = @(
    @("attendanceController.js", "attendance/attendance.controller.js"),
    @("attendanceActionsController.js", "attendance/attendanceActions.controller.js"),
    @("attendanceWebController.js", "attendance/attendanceWeb.controller.js"),
    @("attendanceMachineController.js", "attendance/attendanceMachine.controller.js"),
    @("holidayController.js", "holiday/holiday.controller.js"),
    @("shiftController.js", "shift/shift.controller.js")
)

foreach ($pair in $hrControllers) {
    $src = "src\controllers\$($pair[0])"
    $dest = "newSrc\modules\hr\$($pair[1])"
    if (Test-Path $src) {
        Copy-Item $src $dest
        Write-Detail "HR Controller: $($pair[0])"
    }
}

# HR Services - attendance subfolder
if (Test-Path "src\services\attendance\dailyProcessor.js") {
    Copy-Item "src\services\attendance\dailyProcessor.js" "newSrc\modules\hr\attendance\dailyProcessor.service.js"
    Write-Detail "HR Service: dailyProcessor.js"
}

# -------------------------------
# MODULE 3: INVENTORY
# -------------------------------
Write-Info "Migrating Inventory Module..."

# Inventory Models
$inventoryModels = @(
    @("productModel.js", "products/product.model.js"),
    @("purchaseModel.js", "purchases/purchase.model.js"),
    @("salesModel.js", "sales/sales.model.js"),
    @("salesReturnModel.js", "returns/salesReturn.model.js"),
    @("stockTransferModel.js", "stock/stockTransfer.model.js")
)

foreach ($pair in $inventoryModels) {
    $src = "src\models\$($pair[0])"
    $dest = "newSrc\modules\inventory\$($pair[1])"
    if (Test-Path $src) {
        Copy-Item $src $dest
        Write-Detail "Inventory Model: $($pair[0])"
    }
}

# Inventory Controllers
$inventoryControllers = @(
    @("inventoryController.js", "core/inventory.controller.js"),
    @("productController.js", "products/product.controller.js"),
    @("purchaseController.js", "purchases/purchase.controller.js"),
    @("salesController.js", "sales/sales.controller.js"),
    @("salesReturnController.js", "returns/salesReturn.controller.js"),
    @("stockController.js", "stock/stock.controller.js")
)

foreach ($pair in $inventoryControllers) {
    $src = "src\controllers\$($pair[0])"
    $dest = "newSrc\modules\inventory\$($pair[1])"
    if (Test-Path $src) {
        Copy-Item $src $dest
        Write-Detail "Inventory Controller: $($pair[0])"
    }
}

# Inventory Services
$inventoryServices = @(
    @("inventoryAlertService.js", "core/inventoryAlert.service.js"),
    @("inventoryJournalService.js", "core/inventoryJournal.service.js"),
    @("salesJournalService.js", "sales/salesJournal.service.js"),
    @("salesService.js", "sales/sales.service.js"),
    @("stockValidationService.js", "stock/stockValidation.service.js")
)

foreach ($pair in $inventoryServices) {
    $src = "src\services\$($pair[0])"
    $dest = "newSrc\modules\inventory\$($pair[1])"
    if (Test-Path $src) {
        Copy-Item $src $dest
        Write-Detail "Inventory Service: $($pair[0])"
    }
}

# -------------------------------
# MODULE 4: ORGANIZATION
# -------------------------------
Write-Info "Migrating Organization Module..."

# Organization Models
$orgModels = @(
    @("organizationModel.js", "core/organization.model.js"),
    @("branchModel.js", "branches/branch.model.js"),
    @("customerModel.js", "customers/customer.model.js"),
    @("supplierModel.js", "suppliers/supplier.model.js"),
    @("channelModel.js", "channels/channel.model.js")
)

foreach ($pair in $orgModels) {
    $src = "src\models\$($pair[0])"
    $dest = "newSrc\modules\organization\$($pair[1])"
    if (Test-Path $src) {
        Copy-Item $src $dest
        Write-Detail "Organization Model: $($pair[0])"
    }
}

# Organization Controllers
$orgControllers = @(
    @("organizationController.js", "core/organization.controller.js"),
    @("organizationExtrasController.js", "core/organizationExtras.controller.js"),
    @("branchController.js", "branches/branch.controller.js"),
    @("customerController.js", "customers/customer.controller.js"),
    @("supplierController.js", "suppliers/supplier.controller.js"),
    @("channelController.js", "channels/channel.controller.js")
)

foreach ($pair in $orgControllers) {
    $src = "src\controllers\$($pair[0])"
    $dest = "newSrc\modules\organization\$($pair[1])"
    if (Test-Path $src) {
        Copy-Item $src $dest
        Write-Detail "Organization Controller: $($pair[0])"
    }
}

# Organization Services
$orgServices = @(
    @("customerService.js", "customers/customer.service.js")
)

foreach ($pair in $orgServices) {
    $src = "src\services\$($pair[0])"
    $dest = "newSrc\modules\organization\$($pair[1])"
    if (Test-Path $src) {
        Copy-Item $src $dest
        Write-Detail "Organization Service: $($pair[0])"
    }
}

# -------------------------------
# MODULE 5: AUTH
# -------------------------------
Write-Info "Migrating Auth Module..."

# Auth Models
$authModels = @(
    @("userModel.js", "users/user.model.js"),
    @("roleModel.js", "roles/role.model.js"),
    @("sessionModel.js", "sessions/session.model.js")
)

foreach ($pair in $authModels) {
    $src = "src\models\$($pair[0])"
    $dest = "newSrc\modules\auth\$($pair[1])"
    if (Test-Path $src) {
        Copy-Item $src $dest
        Write-Detail "Auth Model: $($pair[0])"
    }
}

# Auth Controllers
$authControllers = @(
    @("authController.js", "core/auth.controller.js"),
    @("userController.js", "users/user.controller.js"),
    @("roleControllers.js", "roles/role.controller.js"),
    @("sessionController.js", "sessions/session.controller.js")
)

foreach ($pair in $authControllers) {
    $src = "src\controllers\$($pair[0])"
    $dest = "newSrc\modules\auth\$($pair[1])"
    if (Test-Path $src) {
        Copy-Item $src $dest
        Write-Detail "Auth Controller: $($pair[0])"
    }
}

# -------------------------------
# MODULE 6: NOTIFICATION
# -------------------------------
Write-Info "Migrating Notification Module..."

# Notification Models
$notificationModels = @(
    @("notificationModel.js", "core/notification.model.js"),
    @("announcementModel.js", "announcements/announcement.model.js"),
    @("messageModel.js", "messages/message.model.js")
)

foreach ($pair in $notificationModels) {
    $src = "src\models\$($pair[0])"
    $dest = "newSrc\modules\notification\$($pair[1])"
    if (Test-Path $src) {
        Copy-Item $src $dest
        Write-Detail "Notification Model: $($pair[0])"
    }
}

# Notification Controllers
$notificationControllers = @(
    @("notificationController.js", "core/notification.controller.js"),
    @("announcementController.js", "announcements/announcement.controller.js"),
    @("messageController.js", "messages/message.controller.js")
)

foreach ($pair in $notificationControllers) {
    $src = "src\controllers\$($pair[0])"
    $dest = "newSrc\modules\notification\$($pair[1])"
    if (Test-Path $src) {
        Copy-Item $src $dest
        Write-Detail "Notification Controller: $($pair[0])"
    }
}

# Notification Services
$notificationServices = @(
    @("notificationService.js", "core/notification.service.js"),
    @("overdueReminderService.js", "core/overdueReminder.service.js"),
    @("paymentReminderService.js", "core/paymentReminder.service.js")
)

foreach ($pair in $notificationServices) {
    $src = "src\services\$($pair[0])"
    $dest = "newSrc\modules\notification\$($pair[1])"
    if (Test-Path $src) {
        Copy-Item $src $dest
        Write-Detail "Notification Service: $($pair[0])"
    }
}

# -------------------------------
# MODULE 7: MASTER
# -------------------------------
Write-Info "Migrating Master Module..."

# Master Models
$masterModels = @(
    @("masterModel.js", "core/master.model.js"),
    @("masterTypeModel.js", "types/masterType.model.js")
)

foreach ($pair in $masterModels) {
    $src = "src\models\$($pair[0])"
    $dest = "newSrc\modules\master\$($pair[1])"
    if (Test-Path $src) {
        Copy-Item $src $dest
        Write-Detail "Master Model: $($pair[0])"
    }
}

# Master Controllers
$masterControllers = @(
    @("masterController.js", "core/master.controller.js"),
    @("masterTypeController.js", "types/masterType.controller.js"),
    @("masterListController.js", "lists/masterList.controller.js")
)

foreach ($pair in $masterControllers) {
    $src = "src\controllers\$($pair[0])"
    $dest = "newSrc\modules\master\$($pair[1])"
    if (Test-Path $src) {
        Copy-Item $src $dest
        Write-Detail "Master Controller: $($pair[0])"
    }
}

# -------------------------------
# MODULE 8: ANALYTICS
# -------------------------------
Write-Info "Migrating Analytics Module..."

# Analytics Models (if any)
# Currently none in your structure

# Analytics Controllers
$analyticsControllers = @(
    @("analyticsController.js", "insights/analytics.controller.js"),
    @("dashboardController.js", "dashboard/dashboard.controller.js"),
    @("chartController.js", "charts/chart.controller.js"),
    @("searchController.js", "insights/search.controller.js")
)

foreach ($pair in $analyticsControllers) {
    $src = "src\controllers\$($pair[0])"
    $dest = "newSrc\modules\analytics\$($pair[1])"
    if (Test-Path $src) {
        Copy-Item $src $dest
        Write-Detail "Analytics Controller: $($pair[0])"
    }
}

# Analytics Services
$analyticsServices = @(
    @("analyticsService.js", "insights/analytics.service.js"),
    @("dashboardService.js", "dashboard/dashboard.service.js"),
    @("chartService.js", "charts/chart.service.js")
)

foreach ($pair in $analyticsServices) {
    $src = "src\services\$($pair[0])"
    $dest = "newSrc\modules\analytics\$($pair[1])"
    if (Test-Path $src) {
        Copy-Item $src $dest
        Write-Detail "Analytics Service: $($pair[0])"
    }
}

# Analytics folder
if (Test-Path "src\services\analytics") {
    New-Item -ItemType Directory -Path "newSrc\modules\analytics\insights\helpers" -Force | Out-Null
    Copy-Item "src\services\analytics\*.js" "newSrc\modules\analytics\insights\" -Force
    Copy-Item "src\services\analytics\helpers\*.js" "newSrc\modules\analytics\insights\helpers\" -Force -ErrorAction SilentlyContinue
    Write-Detail "Analytics: Copied analytics folder"
}

# -------------------------------
# MODULE 9: COMMUNICATION
# -------------------------------
Write-Info "Migrating Communication Module..."

# Communication Models
$commModels = @(
    @("meetingModel.js", "channels/meeting.model.js")
)

foreach ($pair in $commModels) {
    $src = "src\models\$($pair[0])"
    $dest = "newSrc\modules\communication\$($pair[1])"
    if (Test-Path $src) {
        Copy-Item $src $dest
        Write-Detail "Communication Model: $($pair[0])"
    }
}

# Communication Controllers
$commControllers = @(
    @("feedController.js", "feeds/feed.controller.js")
)

foreach ($pair in $commControllers) {
    $src = "src\controllers\$($pair[0])"
    $dest = "newSrc\modules\communication\$($pair[1])"
    if (Test-Path $src) {
        Copy-Item $src $dest
        Write-Detail "Communication Controller: $($pair[0])"
    }
}

# -------------------------------
# MODULE 10: ADMIN
# -------------------------------
Write-Info "Migrating Admin Module..."

# Admin Models
$adminModels = @(
    @("activityLogModel.js", "logs/activityLog.model.js"),
    @("auditLogModel.js", "logs/auditLog.model.js"),
    @("automationModel.js", "automation/automation.model.js"),
    @("meetingModel.js", "core/meeting.model.js"),
    @("noteModel.js", "core/note.model.js")
)

foreach ($pair in $adminModels) {
    $src = "src\models\$($pair[0])"
    $dest = "newSrc\modules\admin\$($pair[1])"
    if (Test-Path $src) {
        Copy-Item $src $dest
        Write-Detail "Admin Model: $($pair[0])"
    }
}

# Admin Controllers
$adminControllers = @(
    @("adminController.js", "core/admin.controller.js"),
    @("logs.controller.js", "logs/logs.controller.js"),
    @("automationController.js", "automation/automation.controller.js"),
    @("monitorController.js", "monitoring/monitor.controller.js"),
    @("noteController.js", "core/note.controller.js"),
    @("ownership.controller.js", "core/ownership.controller.js")
)

foreach ($pair in $adminControllers) {
    $src = "src\controllers\$($pair[0])"
    $dest = "newSrc\modules\admin\$($pair[1])"
    if (Test-Path $src) {
        Copy-Item $src $dest
        Write-Detail "Admin Controller: $($pair[0])"
    }
}

# Admin Services
$adminServices = @(
    @("adminService.js", "core/admin.service.js"),
    @("activityLogService.js", "logs/activityLog.service.js"),
    @("automationService.js", "automation/automation.service.js"),
    @("ownership.service.js", "core/ownership.service.js")
)

foreach ($pair in $adminServices) {
    $src = "src\services\$($pair[0])"
    $dest = "newSrc\modules\admin\$($pair[1])"
    if (Test-Path $src) {
        Copy-Item $src $dest
        Write-Detail "Admin Service: $($pair[0])"
    }
}

# -------------------------------
# MODULE 11: UTILITIES
# -------------------------------
Write-Info "Migrating Utilities Module..."

# Utilities Controllers
$utilsControllers = @(
    @("uploadController.js", "uploads/upload.controller.js"),
    @("paymentWebhookController.js", "uploads/paymentWebhook.controller.js")
)

foreach ($pair in $utilsControllers) {
    $src = "src\controllers\$($pair[0])"
    $dest = "newSrc\modules\utilities\$($pair[1])"
    if (Test-Path $src) {
        Copy-Item $src $dest
        Write-Detail "Utilities Controller: $($pair[0])"
    }
}

# AI Services
if (Test-Path "src\services\ai") {
    Copy-Item "src\services\ai\*" -Recurse "newSrc\modules\utilities\ai\" -Force
    Write-Detail "Utilities: Copied AI folder"
}

# Upload Services
if (Test-Path "src\services\uploads") {
    Copy-Item "src\services\uploads\*" -Recurse "newSrc\modules\utilities\uploads\" -Force
    Write-Detail "Utilities: Copied uploads folder"
}

# TransferRequest model
if (Test-Path "src\models\TransferRequest.js") {
    Copy-Item "src\models\TransferRequest.js" "newSrc\modules\utilities\uploads\TransferRequest.model.js"
    Write-Detail "Utilities: TransferRequest.js"
}

# -------------------------------
# MIGRATE REMAINING FILES TO LEGACY
# -------------------------------
Write-Info "Migrating remaining files to legacy..."

# Remaining Models to Legacy
$modelFiles = Get-ChildItem "src\models" -File
foreach ($model in $modelFiles) {
    $dest = "newSrc\modules\_legacy\models\$($model.Name)"
    if (-not (Test-Path $dest)) {
        Copy-Item $model.FullName $dest
        Write-Detail "Legacy Model: $($model.Name)"
    }
}

# Remaining Controllers to Legacy
$controllerFiles = Get-ChildItem "src\controllers" -File
foreach ($controller in $controllerFiles) {
    $dest = "newSrc\modules\_legacy\controllers\$($controller.Name)"
    if (-not (Test-Path $dest)) {
        Copy-Item $controller.FullName $dest
        Write-Detail "Legacy Controller: $($controller.Name)"
    }
}

# Remaining Services to Legacy
$serviceFiles = Get-ChildItem "src\services" -File -ErrorAction SilentlyContinue
foreach ($service in $serviceFiles) {
    $dest = "newSrc\modules\_legacy\services\$($service.Name)"
    if (-not (Test-Path $dest)) {
        Copy-Item $service.FullName $dest
        Write-Detail "Legacy Service: $($service.Name)"
    }
}

# Remaining service folders to Legacy
$serviceFolders = Get-ChildItem "src\services" -Directory -ErrorAction SilentlyContinue
foreach ($folder in $serviceFolders) {
    if ($folder.Name -notin @("ai", "analytics", "attendance", "uploads")) {
        Copy-Item "src\services\$($folder.Name)" -Recurse "newSrc\modules\_legacy\services\$($folder.Name)\" -Force
        Write-Detail "Legacy Service Folder: $($folder.Name)"
    }
}

# -------------------------------
# MIGRATE REMAINING FOLDERS
# -------------------------------
Write-Info "Migrating remaining folders..."

# Routes
if (Test-Path "src\routes") {
    Copy-Item "src\routes\*" -Recurse "newSrc\routes\" -Force
    Write-Detail "Routes: Copied routes folder"
}

# Validations
if (Test-Path "src\validations") {
    Copy-Item "src\validations\*" -Recurse "newSrc\shared\validations\" -Force
    Write-Detail "Validations: Copied validations folder"
}

# Scripts
if (Test-Path "src\scripts") {
    Copy-Item "src\scripts\*" -Recurse "newSrc\scripts\" -Force
    Write-Detail "Scripts: Copied scripts folder"
}

# Public
if (Test-Path "src\public") {
    Copy-Item "src\public\*" -Recurse "newSrc\public\" -Force
    Write-Detail "Public: Copied public folder"
}

# Logs (empty directory)
if (Test-Path "src\logs") {
    Copy-Item "src\logs\*" -Recurse "newSrc\logs\" -Force -ErrorAction SilentlyContinue
    Write-Detail "Logs: Copied logs folder"
}

# Socket Handlers
if (Test-Path "src\socketHandlers") {
    Copy-Item "src\socketHandlers\*" -Recurse "newSrc\socketHandlers\" -Force
    Write-Detail "Socket Handlers: Copied socket handlers"
}

# -------------------------------
# CREATE MODULE INDEX FILES
# -------------------------------
Write-Info "Creating module index files..."

# Accounting index
$accountingIndex = @"
// Accounting Module
module.exports = {
    // Models
    Account: require('./core/account.model'),
    AccountEntry: require('./core/accountEntry.model'),
    Invoice: require('./billing/invoice.model'),
    Payment: require('./payments/payment.model'),
    
    // Controllers
    accountController: require('./core/account.controller'),
    invoiceController: require('./billing/invoice.controller'),
    paymentController: require('./payments/payment.controller'),
    
    // Services
    accountService: require('./core/account.service')
};
"@

$accountingIndex | Out-File -FilePath "newSrc\modules\accounting\index.js" -Encoding UTF8
Write-Detail "Created: modules/accounting/index.js"

# HR index
$hrIndex = @"
// HR Module
module.exports = {
    // Attendance
    AttendanceDaily: require('./attendance/models/attendanceDaily.model'),
    AttendanceRequest: require('./attendance/models/attendanceRequest.model'),
    
    // Controllers
    attendanceController: require('./attendance/attendance.controller'),
    holidayController: require('./holiday/holiday.controller')
};
"@

$hrIndex | Out-File -FilePath "newSrc\modules\hr\index.js" -Encoding UTF8
Write-Detail "Created: modules/hr/index.js"

# -------------------------------
# SUMMARY
# -------------------------------
Write-Info "Migration complete!"
Write-Host ""
Write-Host "========================================" -ForegroundColor Green
Write-Host "MIGRATION COMPLETED SUCCESSFULLY!" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
Write-Host ""
Write-Host "Summary:" -ForegroundColor Cyan
Write-Host "• Created 11 modular business domains" -ForegroundColor Gray
Write-Host "• Organized all controllers by module" -ForegroundColor Gray
Write-Host "• Organized all models by module" -ForegroundColor Gray
Write-Host "• Organized all services by module" -ForegroundColor Gray
Write-Host "• Preserved all original files in src/" -ForegroundColor Gray
Write-Host ""
Write-Host "Key Changes Made:" -ForegroundColor Cyan
Write-Host "• Kept handleFactorynew.js and newApiFeatures.js with original names" -ForegroundColor Gray
Write-Host "• Fixed template file handling (they were files, not a directory)" -ForegroundColor Gray
Write-Host "• Organized analytics helpers folder properly" -ForegroundColor Gray
Write-Host ""
Write-Host "Modules Created:" -ForegroundColor Cyan
Write-Host "1. Accounting" -ForegroundColor Gray
Write-Host "2. HR (Attendance, Holiday, Shift, Leave)" -ForegroundColor Gray
Write-Host "3. Inventory" -ForegroundColor Gray
Write-Host "4. Organization" -ForegroundColor Gray
Write-Host "5. Auth" -ForegroundColor Gray
Write-Host "6. Notification" -ForegroundColor Gray
Write-Host "7. Master" -ForegroundColor Gray
Write-Host "8. Analytics" -ForegroundColor Gray
Write-Host "9. Communication" -ForegroundColor Gray
Write-Host "10. Admin" -ForegroundColor Gray
Write-Host "11. Utilities" -ForegroundColor Gray
Write-Host ""
Write-Host "Next Steps:" -ForegroundColor Yellow
Write-Host "1. Update imports in files (run import fixer)" -ForegroundColor Gray
Write-Host "2. Update server.js to use new structure" -ForegroundColor Gray
Write-Host "3. Test one module at a time" -ForegroundColor Gray
Write-Host ""
Write-Host "Your original src/ folder is preserved!" -ForegroundColor Green
Write-Host "New modular structure at: newSrc/" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
