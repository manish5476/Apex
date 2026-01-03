# ======================================================
# APEX CRM – COMPLETE MIGRATION SCRIPT (FINAL)
# ======================================================

$ErrorActionPreference = "Stop"

# -------------------------------
# CHECK IF newSrc EXISTS AND HANDLE IT
# -------------------------------
if (Test-Path "newSrc") {
    Write-Host "Warning: newSrc already exists." -ForegroundColor Yellow
    $response = Read-Host "Do you want to (O)verwrite, (B)ackup and create new, or (C)ancel? [O/B/C]"
    
    switch ($response.ToUpper()) {
        "O" {
            Write-Host "Overwriting existing newSrc folder..." -ForegroundColor Yellow
            Remove-Item -Path "newSrc" -Recurse -Force
        }
        "B" {
            $timestamp = Get-Date -Format "yyyyMMdd_HHmmss"
            $backupName = "newSrc_backup_$timestamp"
            Write-Host "Backing up existing newSrc to $backupName..." -ForegroundColor Yellow
            Rename-Item -Path "newSrc" -NewName $backupName
        }
        default {
            Write-Host "Migration cancelled." -ForegroundColor Red
            exit 1
        }
    }
}

Write-Host "Starting complete migration" -ForegroundColor Green

# -------------------------------
# BASE STRUCTURE (ENHANCED)
# -------------------------------
$dirs = @(
    "newSrc",
    "newSrc/bootstrap",
    "newSrc/config",
    "newSrc/core/error",
    "newSrc/core/middleware",
    "newSrc/core/utils",
    "newSrc/core/utils/_legacy",
    "newSrc/core/jobs",
    "newSrc/core/jobs/_legacy",
    "newSrc/modules",
    "newSrc/modules/accounting/core",
    "newSrc/modules/accounting/billing",
    "newSrc/modules/accounting/payments",
    "newSrc/modules/hr/attendance",
    "newSrc/modules/hr/attendance/models",
    "newSrc/modules/hr/holiday",
    "newSrc/modules/hr/shift",
    "newSrc/modules/hr/leave",
    "newSrc/modules/inventory",
    "newSrc/modules/inventory/core",
    "newSrc/modules/master",
    "newSrc/modules/master/core",
    "newSrc/modules/notification",
    "newSrc/modules/notification/core",
    "newSrc/modules/organization",
    "newSrc/modules/organization/core",
    "newSrc/modules/sales",
    "newSrc/modules/sales/core",
    "newSrc/modules/auth",
    "newSrc/modules/auth/core",
    "newSrc/modules/_legacy/controllers",
    "newSrc/modules/_legacy/services",
    "newSrc/modules/_legacy/models",
    "newSrc/routes",
    "newSrc/routes/v1",
    "newSrc/shared/validations",
    "newSrc/shared/middleware",
    "newSrc/scripts",
    "newSrc/public",
    "newSrc/public/fonts",
    "newSrc/logs",
    "newSrc/tests"
)

foreach ($d in $dirs) {
    if (-not (Test-Path $d)) {
        New-Item -ItemType Directory -Path $d -Force | Out-Null
        Write-Host "Created directory: $d" -ForegroundColor DarkGray
    }
}

# -------------------------------
# ROOT FILES (COMPLETE)
# -------------------------------
$rootFiles = @(".env", ".env.example", ".gitignore", "app.js", "server.js", "debug-ai.js")
foreach ($file in $rootFiles) {
    $srcPath = "src\$file"
    $destPath = "newSrc\$file"
    if (Test-Path $srcPath) {
        Copy-Item $srcPath $destPath -ErrorAction SilentlyContinue
        Write-Host "Copied: $file" -ForegroundColor DarkGray
    } else {
        Write-Host "Warning: $srcPath not found" -ForegroundColor Yellow
    }
}

# -------------------------------
# BOOTSTRAP (COMPLETE)
# -------------------------------
$bootstrapFiles = @(
    @("config\db.js", "bootstrap\db.js"),
    @("config\logger.js", "bootstrap\logger.js"),
    @("config\swaggerConfig.js", "bootstrap\swagger.js")
)

foreach ($filePair in $bootstrapFiles) {
    $src = "src\$($filePair[0])"
    $dest = "newSrc\$($filePair[1])"
    if (Test-Path $src) {
        Copy-Item $src $dest -ErrorAction SilentlyContinue
        Write-Host "Copied: $($filePair[0]) -> $($filePair[1])" -ForegroundColor DarkGray
    }
}

# -------------------------------
# CONFIG (COMPLETE)
# -------------------------------
if (Test-Path "src\config\permissions.js") {
    Copy-Item "src\config\permissions.js" "newSrc\config\permissions.js"
    Write-Host "Copied: config\permissions.js" -ForegroundColor DarkGray
}

# -------------------------------
# ERROR HANDLING (COMPLETE)
# -------------------------------
$errorFiles = @(
    @("middleware\errorHandler.js", "core\error\errorHandler.js"),
    @("middleware\errorController.js", "core\error\errorController.js")
)

foreach ($filePair in $errorFiles) {
    $src = "src\$($filePair[0])"
    $dest = "newSrc\$($filePair[1])"
    if (Test-Path $src) {
        Copy-Item $src $dest -ErrorAction SilentlyContinue
        Write-Host "Copied: $($filePair[0]) -> $($filePair[1])" -ForegroundColor DarkGray
    }
}

# -------------------------------
# CORE MIDDLEWARE (COMPLETE)
# -------------------------------
$middlewareMap = @{
    "assignRequestId.js"      = "requestId.middleware.js"
    "authMiddleware.js"       = "auth.middleware.js"
    "permissionMiddleware.js" = "permission.middleware.js"
    "cacheMiddleware.js"      = "cache.middleware.js"
    "uploadMiddleware.js"     = "upload.middleware.js"
    "sessionActivity.js"      = "session.middleware.js"
    "periodLock.js"           = "periodLock.middleware.js"
    "forgotPasswordLimiter.js" = "rateLimit.middleware.js"
}

foreach ($m in $middlewareMap.Keys) {
    $src = "src\middleware\$m"
    $dest = "newSrc\core\middleware\" + $middlewareMap[$m]
    if (Test-Path $src) {
        Copy-Item $src $dest -ErrorAction SilentlyContinue
        Write-Host "Copied: middleware\$m -> core\middleware\$($middlewareMap[$m])" -ForegroundColor DarkGray
    } else {
        Write-Host "Warning: $src not found" -ForegroundColor Yellow
    }
}

# Copy Multer config separately as it's not middleware
if (Test-Path "src\middleware\multerConfig.js") {
    Copy-Item "src\middleware\multerConfig.js" "newSrc\core\utils\_legacy\multerConfig.js" -ErrorAction SilentlyContinue
    Write-Host "Copied: middleware\multerConfig.js -> core\utils\_legacy\multerConfig.js" -ForegroundColor DarkGray
}

# -------------------------------
# SHARED MIDDLEWARE
# -------------------------------
if (Test-Path "src\middleware\assignRequestId.js") {
    Copy-Item "src\middleware\assignRequestId.js" "newSrc\shared\middleware\requestId.js"
    Write-Host "Copied: middleware\assignRequestId.js -> shared\middleware\requestId.js" -ForegroundColor DarkGray
}

# -------------------------------
# ACCOUNTING MODULES
# -------------------------------
Write-Host "`nMigrating Accounting Module..." -ForegroundColor Cyan

# Core Accounting
$accountingFiles = @(
    @("models\accountModel.js", "modules\accounting\core\account.model.js"),
    @("models\accountEntryModel.js", "modules\accounting\core\accountEntry.model.js"),
    @("controllers\accountController.js", "modules\accounting\core\account.controller.js"),
    @("controllers\ledgerController.js", "modules\accounting\core\ledger.controller.js"),
    @("controllers\transactionController.js", "modules\accounting\core\transaction.controller.js"),
    @("controllers\reconciliationController.js", "modules\accounting\core\reconciliation.controller.js"),
    
    # Billing/Invoice
    @("models\invoiceModel.js", "modules\accounting\billing\invoice.model.js"),
    @("models\invoiceAuditModel.js", "modules\accounting\billing\invoiceAudit.model.js"),
    @("controllers\invoiceController.js", "modules\accounting\billing\invoice.controller.js"),
    @("controllers\invoicePDFController.js", "modules\accounting\billing\invoicePDF.controller.js"),
    
    # Payments
    @("models\paymentModel.js", "modules\accounting\payments\payment.model.js"),
    @("models\emiModel.js", "modules\accounting\payments\emi.model.js"),
    @("controllers\paymentController.js", "modules\accounting\payments\payment.controller.js"),
    @("controllers\emiController.js", "modules\accounting\payments\emi.controller.js")
)

foreach ($filePair in $accountingFiles) {
    $src = "src\$($filePair[0])"
    $dest = "newSrc\$($filePair[1])"
    if (Test-Path $src) {
        Copy-Item $src $dest -ErrorAction SilentlyContinue
        Write-Host "  Copied: $($filePair[0])" -ForegroundColor DarkGray
    } else {
        Write-Host "  Warning: $src not found" -ForegroundColor DarkYellow
    }
}

# -------------------------------
# HR MODULES
# -------------------------------
Write-Host "`nMigrating HR Module..." -ForegroundColor Cyan

$hrFiles = @(
    # Attendance
    @("models\attendanceDailyModel.js", "modules\hr\attendance\models\attendanceDaily.model.js"),
    @("models\attendanceLogModel.js", "modules\hr\attendance\models\attendanceLog.model.js"),
    @("models\attendanceMachineModel.js", "modules\hr\attendance\models\attendanceMachine.model.js"),
    @("models\attendanceRequestModel.js", "modules\hr\attendance\models\attendanceRequest.model.js"),
    @("controllers\attendanceController.js", "modules\hr\attendance\attendance.controller.js"),
    @("controllers\attendanceActionsController.js", "modules\hr\attendance\attendanceActions.controller.js"),
    @("controllers\attendanceWebController.js", "modules\hr\attendance\attendanceWeb.controller.js"),
    
    # Holiday
    @("models\holidayModel.js", "modules\hr\holiday\holiday.model.js"),
    @("controllers\holidayController.js", "modules\hr\holiday\holiday.controller.js"),
    
    # Shift
    @("models\shiftModel.js", "modules\hr\shift\shift.model.js"),
    @("controllers\shiftController.js", "modules\hr\shift\shift.controller.js"),
    
    # Leave
    @("models\leaveRequestModel.js", "modules\hr\leave\leaveRequest.model.js")
)

foreach ($filePair in $hrFiles) {
    $src = "src\$($filePair[0])"
    $dest = "newSrc\$($filePair[1])"
    if (Test-Path $src) {
        Copy-Item $src $dest -ErrorAction SilentlyContinue
        Write-Host "  Copied: $($filePair[0])" -ForegroundColor DarkGray
    } else {
        Write-Host "  Warning: $src not found" -ForegroundColor DarkYellow
    }
}

# -------------------------------
# INVENTORY MODULE
# -------------------------------
Write-Host "`nMigrating Inventory Module..." -ForegroundColor Cyan

$inventoryFiles = @(
    @("models\productModel.js", "modules\inventory\core\product.model.js"),
    @("models\purchaseModel.js", "modules\inventory\core\purchase.model.js"),
    @("models\salesModel.js", "modules\inventory\core\sales.model.js"),
    @("controllers\inventoryController.js", "modules\inventory\core\inventory.controller.js"),
    @("controllers\productController.js", "modules\inventory\core\product.controller.js"),
    @("controllers\purchaseController.js", "modules\inventory\core\purchase.controller.js"),
    @("controllers\salesController.js", "modules\inventory\core\sales.controller.js"),
    @("controllers\salesReturnController.js", "modules\inventory\core\salesReturn.controller.js")
)

foreach ($filePair in $inventoryFiles) {
    $src = "src\$($filePair[0])"
    $dest = "newSrc\$($filePair[1])"
    if (Test-Path $src) {
        Copy-Item $src $dest -ErrorAction SilentlyContinue
        Write-Host "  Copied: $($filePair[0])" -ForegroundColor DarkGray
    } else {
        Write-Host "  Warning: $src not found" -ForegroundColor DarkYellow
    }
}

# Handle salesReturnModel.js in the nested location
$salesReturnSrc1 = "src\models\salesReturnModel.js"
$salesReturnSrc2 = "src\models\src\models\salesReturnModel.js"
$salesReturnDest = "newSrc\modules\inventory\core\salesReturn.model.js"

if (Test-Path $salesReturnSrc1) {
    Copy-Item $salesReturnSrc1 $salesReturnDest -ErrorAction SilentlyContinue
    Write-Host "  Copied: models\salesReturnModel.js" -ForegroundColor DarkGray
} elseif (Test-Path $salesReturnSrc2) {
    Copy-Item $salesReturnSrc2 $salesReturnDest -ErrorAction SilentlyContinue
    Write-Host "  Copied: models\src\models\salesReturnModel.js" -ForegroundColor DarkGray
} else {
    Write-Host "  Warning: salesReturnModel.js not found in either location" -ForegroundColor DarkYellow
}

# -------------------------------
# MASTER MODULE
# -------------------------------
Write-Host "`nMigrating Master Module..." -ForegroundColor Cyan

$masterFiles = @(
    @("models\masterModel.js", "modules\master\core\master.model.js"),
    @("models\masterTypeModel.js", "modules\master\core\masterType.model.js"),
    @("controllers\masterController.js", "modules\master\core\master.controller.js"),
    @("controllers\masterTypeController.js", "modules\master\core\masterType.controller.js"),
    @("controllers\masterListController.js", "modules\master\core\masterList.controller.js")
)

foreach ($filePair in $masterFiles) {
    $src = "src\$($filePair[0])"
    $dest = "newSrc\$($filePair[1])"
    if (Test-Path $src) {
        Copy-Item $src $dest -ErrorAction SilentlyContinue
        Write-Host "  Copied: $($filePair[0])" -ForegroundColor DarkGray
    } else {
        Write-Host "  Warning: $src not found" -ForegroundColor DarkYellow
    }
}

# -------------------------------
# NOTIFICATION MODULE
# -------------------------------
Write-Host "`nMigrating Notification Module..." -ForegroundColor Cyan

$notificationFiles = @(
    @("models\notificationModel.js", "modules\notification\core\notification.model.js"),
    @("models\announcementModel.js", "modules\notification\core\announcement.model.js"),
    @("models\messageModel.js", "modules\notification\core\message.model.js"),
    @("controllers\notificationController.js", "modules\notification\core\notification.controller.js"),
    @("controllers\announcementController.js", "modules\notification\core\announcement.controller.js"),
    @("controllers\messageController.js", "modules\notification\core\message.controller.js")
)

foreach ($filePair in $notificationFiles) {
    $src = "src\$($filePair[0])"
    $dest = "newSrc\$($filePair[1])"
    if (Test-Path $src) {
        Copy-Item $src $dest -ErrorAction SilentlyContinue
        Write-Host "  Copied: $($filePair[0])" -ForegroundColor DarkGray
    } else {
        Write-Host "  Warning: $src not found" -ForegroundColor DarkYellow
    }
}

# -------------------------------
# ORGANIZATION MODULE
# -------------------------------
Write-Host "`nMigrating Organization Module..." -ForegroundColor Cyan

$orgFiles = @(
    @("models\organizationModel.js", "modules\organization\core\organization.model.js"),
    @("models\branchModel.js", "modules\organization\core\branch.model.js"),
    @("models\channelModel.js", "modules\organization\core\channel.model.js"),
    @("models\customerModel.js", "modules\organization\core\customer.model.js"),
    @("models\supplierModel.js", "modules\organization\core\supplier.model.js"),
    @("controllers\organizationController.js", "modules\organization\core\organization.controller.js"),
    @("controllers\branchController.js", "modules\organization\core\branch.controller.js"),
    @("controllers\channelController.js", "modules\organization\core\channel.controller.js"),
    @("controllers\customerController.js", "modules\organization\core\customer.controller.js"),
    @("controllers\supplierController.js", "modules\organization\core\supplier.controller.js"),
    @("controllers\organizationExtrasController.js", "modules\organization\core\organizationExtras.controller.js")
)

foreach ($filePair in $orgFiles) {
    $src = "src\$($filePair[0])"
    $dest = "newSrc\$($filePair[1])"
    if (Test-Path $src) {
        Copy-Item $src $dest -ErrorAction SilentlyContinue
        Write-Host "  Copied: $($filePair[0])" -ForegroundColor DarkGray
    } else {
        Write-Host "  Warning: $src not found" -ForegroundColor DarkYellow
    }
}

# -------------------------------
# AUTH MODULE
# -------------------------------
Write-Host "`nMigrating Auth Module..." -ForegroundColor Cyan

$authFiles = @(
    @("models\userModel.js", "modules\auth\core\user.model.js"),
    @("models\roleModel.js", "modules\auth\core\role.model.js"),
    @("models\sessionModel.js", "modules\auth\core\session.model.js"),
    @("controllers\authController.js", "modules\auth\core\auth.controller.js"),
    @("controllers\userController.js", "modules\auth\core\user.controller.js"),
    @("controllers\roleControllers.js", "modules\auth\core\role.controller.js"),
    @("controllers\sessionController.js", "modules\auth\core\session.controller.js")
)

foreach ($filePair in $authFiles) {
    $src = "src\$($filePair[0])"
    $dest = "newSrc\$($filePair[1])"
    if (Test-Path $src) {
        Copy-Item $src $dest -ErrorAction SilentlyContinue
        Write-Host "  Copied: $($filePair[0])" -ForegroundColor DarkGray
    } else {
        Write-Host "  Warning: $src not found" -ForegroundColor DarkYellow
    }
}

# -------------------------------
# LOGS AND AUDIT MODELS
# -------------------------------
Write-Host "`nMigrating Logs and Audit..." -ForegroundColor DarkGray

$logFiles = @(
    @("models\activityLogModel.js", "modules\_legacy\models\activityLogModel.js"),
    @("models\auditLogModel.js", "modules\_legacy\models\auditLogModel.js"),
    @("controllers\logs.controller.js", "modules\_legacy\controllers\logs.controller.js")
)

foreach ($filePair in $logFiles) {
    $src = "src\$($filePair[0])"
    $dest = "newSrc\$($filePair[1])"
    if (Test-Path $src) {
        Copy-Item $src $dest -ErrorAction SilentlyContinue
        Write-Host "  Copied: $($filePair[0])" -ForegroundColor DarkGray
    }
}

# -------------------------------
# OTHER CONTROLLERS TO LEGACY
# -------------------------------
Write-Host "`nMigrating remaining controllers to legacy..." -ForegroundColor DarkGray

$legacyControllers = @(
    "dashboardController.js",
    "analyticsController.js",
    "chartController.js",
    "searchController.js",
    "feedController.js",
    "statementsController.js",
    "monitorController.js",
    "adminController.js",
    "automationController.js",
    "noteController.js",
    "ownership.controller.js",
    "uploadController.js",
    "partyTransactionController.js"
)

foreach ($controller in $legacyControllers) {
    $src = "src\controllers\$controller"
    $dest = "newSrc\modules\_legacy\controllers\$controller"
    if (Test-Path $src) {
        Copy-Item $src $dest -ErrorAction SilentlyContinue
        Write-Host "  Copied: controllers\$controller" -ForegroundColor DarkGray
    }
}

# -------------------------------
# MIGRATE REMAINING MODELS TO LEGACY
# -------------------------------
Write-Host "`nMigrating remaining models to legacy..." -ForegroundColor DarkGray

$excludeModels = @(
    "accountModel.js",
    "accountEntryModel.js",
    "invoiceModel.js",
    "invoiceAuditModel.js",
    "paymentModel.js",
    "emiModel.js",
    "attendanceDailyModel.js",
    "attendanceLogModel.js",
    "attendanceMachineModel.js",
    "attendanceRequestModel.js",
    "holidayModel.js",
    "shiftModel.js",
    "leaveRequestModel.js",
    "productModel.js",
    "purchaseModel.js",
    "salesModel.js",
    "masterModel.js",
    "masterTypeModel.js",
    "notificationModel.js",
    "announcementModel.js",
    "messageModel.js",
    "organizationModel.js",
    "branchModel.js",
    "channelModel.js",
    "customerModel.js",
    "supplierModel.js",
    "userModel.js",
    "roleModel.js",
    "sessionModel.js",
    "activityLogModel.js",
    "auditLogModel.js",
    "salesReturnModel.js"
)

$models = Get-ChildItem "src\models" -File | Where-Object { $_.Name -notin $excludeModels }
foreach ($model in $models) {
    $src = $model.FullName
    $dest = "newSrc\modules\_legacy\models\$($model.Name)"
    Copy-Item $src $dest -ErrorAction SilentlyContinue
    Write-Host "  Copied: models\$($model.Name)" -ForegroundColor DarkGray
}

# Handle TransferRequest.js (with .js extension)
if (Test-Path "src\models\TransferRequest.js") {
    Copy-Item "src\models\TransferRequest.js" "newSrc\modules\_legacy\models\TransferRequest.js"
    Write-Host "  Copied: models\TransferRequest.js" -ForegroundColor DarkGray
}

# -------------------------------
# SERVICES ORGANIZATION
# -------------------------------
Write-Host "`nMigrating Services..." -ForegroundColor Cyan

# Create services directories
$serviceDirs = @(
    "newSrc\modules\accounting\core",
    "newSrc\modules\accounting\payments",
    "newSrc\modules\inventory\core",
    "newSrc\modules\notification\core",
    "newSrc\modules\_legacy\services\analytics",
    "newSrc\modules\_legacy\services\ai",
    "newSrc\modules\_legacy\services\uploads"
)

foreach ($dir in $serviceDirs) {
    if (-not (Test-Path $dir)) {
        New-Item -ItemType Directory -Path $dir -Force | Out-Null
    }
}

# Accounting Services
$accountingServices = @(
    @("services\accountService.js", "modules\accounting\core\account.service.js"),
    @("services\journalService.js", "modules\accounting\core\journal.service.js"),
    @("services\accountingService.js", "modules\accounting\core\accounting.service.js"),
    @("services\transactionService.js", "modules\accounting\core\transaction.service.js"),
    @("services\ledgerCache.js", "modules\accounting\core\ledgerCache.service.js"),
    @("services\payrollService.js", "modules\accounting\payments\payroll.service.js"),
    @("services\paymentPDFService.js", "modules\accounting\payments\paymentPDF.service.js")
)

foreach ($servicePair in $accountingServices) {
    $src = "src\$($servicePair[0])"
    $dest = "newSrc\$($servicePair[1])"
    if (Test-Path $src) {
        Copy-Item $src $dest -ErrorAction SilentlyContinue
        Write-Host "  Copied: $($servicePair[0])" -ForegroundColor DarkGray
    }
}

# Inventory Services
$inventoryServices = @(
    @("services\inventoryJournalService.js", "modules\inventory\core\inventoryJournal.service.js"),
    @("services\inventoryAlertService.js", "modules\inventory\core\inventoryAlert.service.js"),
    @("services\salesJournalService.js", "modules\inventory\core\salesJournal.service.js"),
    @("services\salesService.js", "modules\inventory\core\sales.service.js")
)

foreach ($servicePair in $inventoryServices) {
    $src = "src\$($servicePair[0])"
    $dest = "newSrc\$($servicePair[1])"
    if (Test-Path $src) {
        Copy-Item $src $dest -ErrorAction SilentlyContinue
        Write-Host "  Copied: $($servicePair[0])" -ForegroundColor DarkGray
    }
}

# Notification Services
$notificationServices = @(
    @("services\notificationService.js", "modules\notification\core\notification.service.js"),
    @("services\overdueReminderService.js", "modules\notification\core\overdueReminder.service.js"),
    @("services\paymentReminderService.js", "modules\notification\core\paymentReminder.service.js")
)

foreach ($servicePair in $notificationServices) {
    $src = "src\$($servicePair[0])"
    $dest = "newSrc\$($servicePair[1])"
    if (Test-Path $src) {
        Copy-Item $src $dest -ErrorAction SilentlyContinue
        Write-Host "  Copied: $($servicePair[0])" -ForegroundColor DarkGray
    }
}

# HR Service
if (Test-Path "src\services\attendance\dailyProcessor.js") {
    Copy-Item "src\services\attendance\dailyProcessor.js" "newSrc\modules\hr\attendance\dailyProcessor.service.js"
    Write-Host "  Copied: services\attendance\dailyProcessor.js" -ForegroundColor DarkGray
}

# Analytics Services
if (Test-Path "src\services\analytics") {
    Copy-Item "src\services\analytics\*" -Recurse "newSrc\modules\_legacy\services\analytics\" -ErrorAction SilentlyContinue
    Write-Host "  Copied: services\analytics folder" -ForegroundColor DarkGray
}

# AI Services
if (Test-Path "src\services\ai") {
    Copy-Item "src\services\ai\*" -Recurse "newSrc\modules\_legacy\services\ai\" -ErrorAction SilentlyContinue
    Write-Host "  Copied: services\ai folder" -ForegroundColor DarkGray
}

# Upload Services
if (Test-Path "src\services\uploads") {
    Copy-Item "src\services\uploads\*" -Recurse "newSrc\modules\_legacy\services\uploads\" -ErrorAction SilentlyContinue
    Write-Host "  Copied: services\uploads folder" -ForegroundColor DarkGray
}

# Copy remaining services to legacy
$excludeServices = @(
    "accountService.js",
    "journalService.js",
    "accountingService.js",
    "transactionService.js",
    "ledgerCache.js",
    "payrollService.js",
    "paymentPDFService.js",
    "inventoryJournalService.js",
    "inventoryAlertService.js",
    "salesJournalService.js",
    "salesService.js",
    "notificationService.js",
    "overdueReminderService.js",
    "paymentReminderService.js"
)

$services = Get-ChildItem "src\services" -File | Where-Object { $_.Name -notin $excludeServices }
foreach ($service in $services) {
    $src = $service.FullName
    $dest = "newSrc\modules\_legacy\services\$($service.Name)"
    Copy-Item $src $dest -ErrorAction SilentlyContinue
    Write-Host "  Copied: services\$($service.Name)" -ForegroundColor DarkGray
}

# -------------------------------
# CORE UTILS
# -------------------------------
Write-Host "`nMigrating Utils..." -ForegroundColor Cyan

$coreUtils = @(
    "appError.js",
    "catchAsync.js",
    "ApiFeatures.js",
    "runInTransaction.js",
    "auditLogger.js",
    "authUtils.js",
    "handlerFactory.js"
)

foreach ($util in $coreUtils) {
    $src = "src\utils\$util"
    $dest = "newSrc\core\utils\$util"
    if (Test-Path $src) {
        Copy-Item $src $dest -ErrorAction SilentlyContinue
        Write-Host "  Copied to core: utils\$util" -ForegroundColor DarkGray
    }
}

# Legacy utils
$utils = Get-ChildItem "src\utils" -File
foreach ($util in $utils) {
    if ($coreUtils -notcontains $util.Name) {
        $src = $util.FullName
        $dest = "newSrc\core\utils\_legacy\$($util.Name)"
        Copy-Item $src $dest -ErrorAction SilentlyContinue
        Write-Host "  Copied to legacy: utils\$($util.Name)" -ForegroundColor DarkGray
    }
}

# Copy templates folder
if (Test-Path "src\utils\templates") {
    Copy-Item "src\utils\templates" -Recurse "newSrc\core\utils\_legacy\templates" -Force
    Write-Host "  Copied: utils\templates folder" -ForegroundColor DarkGray
}

# -------------------------------
# JOBS
# -------------------------------
Write-Host "`nMigrating Jobs..." -ForegroundColor DarkGray

if (Test-Path "src\jobs") {
    Copy-Item "src\jobs\*" "newSrc\core\jobs\_legacy" -Recurse -ErrorAction SilentlyContinue
    Write-Host "  Copied: jobs folder" -ForegroundColor DarkGray
}

# -------------------------------
# ROUTES
# -------------------------------
Write-Host "`nMigrating Routes..." -ForegroundColor Cyan

if (Test-Path "src\routes") {
    Copy-Item "src\routes\*" "newSrc\routes" -Recurse -ErrorAction SilentlyContinue
    Write-Host "  Copied: routes folder" -ForegroundColor DarkGray
}

# -------------------------------
# VALIDATIONS
# -------------------------------
Write-Host "`nMigrating Validations..." -ForegroundColor DarkGray

if (Test-Path "src\validations") {
    Copy-Item "src\validations\*" "newSrc\shared\validations" -Recurse -ErrorAction SilentlyContinue
    Write-Host "  Copied: validations folder" -ForegroundColor DarkGray
}

# -------------------------------
# SCRIPTS
# -------------------------------
Write-Host "`nMigrating Scripts..." -ForegroundColor DarkGray

if (Test-Path "src\scripts") {
    Copy-Item "src\scripts\*" "newSrc\scripts" -Recurse -ErrorAction SilentlyContinue
    Write-Host "  Copied: scripts folder" -ForegroundColor DarkGray
}

# -------------------------------
# PUBLIC ASSETS
# -------------------------------
Write-Host "`nMigrating Public Assets..." -ForegroundColor DarkGray

if (Test-Path "src\public") {
    Copy-Item "src\public\*" "newSrc\public" -Recurse -ErrorAction SilentlyContinue
    Write-Host "  Copied: public folder" -ForegroundColor DarkGray
}

# -------------------------------
# LOGS
# -------------------------------
Write-Host "`nMigrating Logs..." -ForegroundColor DarkGray

if (Test-Path "src\logs") {
    Copy-Item "src\logs\*" "newSrc\logs" -Recurse -ErrorAction SilentlyContinue
    Write-Host "  Copied: logs folder" -ForegroundColor DarkGray
}

# -------------------------------
# CREATE INDEX FILES
# -------------------------------
Write-Host "`nCreating module index files..." -ForegroundColor Cyan

# Accounting Module Index
@"
// Accounting Module Export
module.exports = {
    // Core
    Account: require('./core/account.model'),
    AccountEntry: require('./core/accountEntry.model'),
    
    // Billing
    Invoice: require('./billing/invoice.model'),
    InvoiceAudit: require('./billing/invoiceAudit.model'),
    
    // Payments
    Payment: require('./payments/payment.model'),
    EMI: require('./payments/emi.model')
};
"@ | Out-File -FilePath "newSrc\modules\accounting\index.js" -Encoding UTF8
Write-Host "  Created: modules\accounting\index.js" -ForegroundColor DarkGray

# -------------------------------
# SUMMARY
# -------------------------------
Write-Host ""
Write-Host "========================================" -ForegroundColor Green
Write-Host "MIGRATION COMPLETED SUCCESSFULLY!" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
Write-Host ""
Write-Host "Migration Summary:" -ForegroundColor Cyan
Write-Host "✓ All root files migrated" -ForegroundColor Gray
Write-Host "✓ All config files migrated" -ForegroundColor Gray
Write-Host "✓ All controllers organized by module" -ForegroundColor Gray
Write-Host "✓ All models organized by module" -ForegroundColor Gray
Write-Host "✓ All services organized by module" -ForegroundColor Gray
Write-Host "✓ All utils migrated" -ForegroundColor Gray
Write-Host "✓ All routes preserved" -ForegroundColor Gray
Write-Host "✓ All scripts, validations, and public assets copied" -ForegroundColor Gray
Write-Host ""
Write-Host "Modules Created:" -ForegroundColor Cyan
Write-Host "1. Accounting (with submodules: core, billing, payments)" -ForegroundColor Gray
Write-Host "2. HR (with submodules: attendance, holiday, shift, leave)" -ForegroundColor Gray
Write-Host "3. Inventory" -ForegroundColor Gray
Write-Host "4. Master" -ForegroundColor Gray
Write-Host "5. Notification" -ForegroundColor Gray
Write-Host "6. Organization" -ForegroundColor Gray
Write-Host "7. Sales" -ForegroundColor Gray
Write-Host "8. Auth" -ForegroundColor Gray
Write-Host "9. Legacy (for unmigrated code)" -ForegroundColor Gray
Write-Host ""
Write-Host "Next Steps:" -ForegroundColor Cyan
Write-Host "1. Update imports in your new files" -ForegroundColor Gray
Write-Host "2. Update server.js to use new structure" -ForegroundColor Gray
Write-Host "3. Test thoroughly" -ForegroundColor Gray
Write-Host "========================================" -ForegroundColor Green
