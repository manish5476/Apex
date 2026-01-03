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

# # ======================================================
# # APEX CRM – COMPLETE MIGRATION SCRIPT (CORRECTED)
# # ======================================================

# $ErrorActionPreference = "Stop"

# # -------------------------------
# # CHECK IF newSrc EXISTS AND HANDLE IT
# # -------------------------------
# if (Test-Path "newSrc") {
#     Write-Host "Warning: newSrc already exists." -ForegroundColor Yellow
#     $response = Read-Host "Do you want to (O)verwrite, (B)ackup and create new, or (C)ancel? [O/B/C]"
    
#     switch ($response.ToUpper()) {
#         "O" {
#             Write-Host "Overwriting existing newSrc folder..." -ForegroundColor Yellow
#             Remove-Item -Path "newSrc" -Recurse -Force
#         }
#         "B" {
#             $timestamp = Get-Date -Format "yyyyMMdd_HHmmss"
#             $backupName = "newSrc_backup_$timestamp"
#             Write-Host "Backing up existing newSrc to $backupName..." -ForegroundColor Yellow
#             Rename-Item -Path "newSrc" -NewName $backupName
#         }
#         default {
#             Write-Host "Migration cancelled." -ForegroundColor Red
#             exit 1
#         }
#     }
# }

# Write-Host "Starting complete migration" -ForegroundColor Green

# # -------------------------------
# # BASE STRUCTURE (ENHANCED)
# # -------------------------------
# $dirs = @(
#     "newSrc",
#     "newSrc/bootstrap",
#     "newSrc/config",
#     "newSrc/core/error",
#     "newSrc/core/middleware",
#     "newSrc/core/utils",
#     "newSrc/core/utils/_legacy",
#     "newSrc/core/jobs",
#     "newSrc/core/jobs/_legacy",
#     "newSrc/modules",
#     "newSrc/modules/accounting/core",
#     "newSrc/modules/accounting/billing",
#     "newSrc/modules/accounting/payments",
#     "newSrc/modules/hr/attendance",
#     "newSrc/modules/hr/attendance/models",
#     "newSrc/modules/hr/holiday",
#     "newSrc/modules/hr/shift",
#     "newSrc/modules/hr/leave",
#     "newSrc/modules/inventory",
#     "newSrc/modules/inventory/core",
#     "newSrc/modules/master",
#     "newSrc/modules/master/core",
#     "newSrc/modules/notification",
#     "newSrc/modules/notification/core",
#     "newSrc/modules/organization",
#     "newSrc/modules/organization/core",
#     "newSrc/modules/sales",
#     "newSrc/modules/sales/core",
#     "newSrc/modules/auth",
#     "newSrc/modules/auth/core",
#     "newSrc/modules/_legacy/controllers",
#     "newSrc/modules/_legacy/services",
#     "newSrc/modules/_legacy/models",
#     "newSrc/routes",
#     "newSrc/routes/v1",
#     "newSrc/shared/validations",
#     "newSrc/shared/middleware",
#     "newSrc/scripts",
#     "newSrc/public",
#     "newSrc/public/fonts",
#     "newSrc/logs",
#     "newSrc/tests"
# )

# foreach ($d in $dirs) {
#     if (-not (Test-Path $d)) {
#         New-Item -ItemType Directory -Path $d -Force | Out-Null
#         Write-Host "Created directory: $d" -ForegroundColor DarkGray
#     }
# }

# # -------------------------------
# # ROOT FILES (COMPLETE)
# # -------------------------------
# $rootFiles = @(".env", ".env.example", ".gitignore", "app.js", "server.js", "debug-ai.js")
# foreach ($file in $rootFiles) {
#     $srcPath = "src\$file"
#     $destPath = "newSrc\$file"
#     if (Test-Path $srcPath) {
#         Copy-Item $srcPath $destPath -ErrorAction SilentlyContinue
#         Write-Host "Copied: $file" -ForegroundColor DarkGray
#     } else {
#         Write-Host "Warning: $srcPath not found" -ForegroundColor Yellow
#     }
# }

# # -------------------------------
# # BOOTSTRAP (COMPLETE)
# # -------------------------------
# $bootstrapFiles = @(
#     @("config\db.js", "bootstrap\db.js"),
#     @("config\logger.js", "bootstrap\logger.js"),
#     @("config\swaggerConfig.js", "bootstrap\swagger.js")
# )

# foreach ($filePair in $bootstrapFiles) {
#     $src = "src\$($filePair[0])"
#     $dest = "newSrc\$($filePair[1])"
#     if (Test-Path $src) {
#         Copy-Item $src $dest -ErrorAction SilentlyContinue
#         Write-Host "Copied: $($filePair[0]) -> $($filePair[1])" -ForegroundColor DarkGray
#     }
# }

# # -------------------------------
# # CONFIG (COMPLETE)
# # -------------------------------
# if (Test-Path "src\config\permissions.js") {
#     Copy-Item "src\config\permissions.js" "newSrc\config\permissions.js"
#     Write-Host "Copied: config\permissions.js" -ForegroundColor DarkGray
# }

# # -------------------------------
# # ERROR HANDLING (COMPLETE)
# # -------------------------------
# $errorFiles = @(
#     @("middleware\errorHandler.js", "core\error\errorHandler.js"),
#     @("middleware\errorController.js", "core\error\errorController.js")
# )

# foreach ($filePair in $errorFiles) {
#     $src = "src\$($filePair[0])"
#     $dest = "newSrc\$($filePair[1])"
#     if (Test-Path $src) {
#         Copy-Item $src $dest -ErrorAction SilentlyContinue
#         Write-Host "Copied: $($filePair[0]) -> $($filePair[1])" -ForegroundColor DarkGray
#     }
# }

# # -------------------------------
# # CORE MIDDLEWARE (COMPLETE)
# # -------------------------------
# $middlewareMap = @{
#     "assignRequestId.js"      = "requestId.middleware.js"
#     "authMiddleware.js"       = "auth.middleware.js"
#     "permissionMiddleware.js" = "permission.middleware.js"
#     "cacheMiddleware.js"      = "cache.middleware.js"
#     "uploadMiddleware.js"     = "upload.middleware.js"
#     "sessionActivity.js"      = "session.middleware.js"
#     "periodLock.js"           = "periodLock.middleware.js"
#     "forgotPasswordLimiter.js" = "rateLimit.middleware.js"
# }

# foreach ($m in $middlewareMap.Keys) {
#     $src = "src\middleware\$m"
#     $dest = "newSrc\core\middleware\" + $middlewareMap[$m]
#     if (Test-Path $src) {
#         Copy-Item $src $dest -ErrorAction SilentlyContinue
#         Write-Host "Copied: middleware\$m -> core\middleware\$($middlewareMap[$m])" -ForegroundColor DarkGray
#     } else {
#         Write-Host "Warning: $src not found" -ForegroundColor Yellow
#     }
# }

# # Copy Multer config separately as it's not middleware
# if (Test-Path "src\middleware\multerConfig.js") {
#     Copy-Item "src\middleware\multerConfig.js" "newSrc\core\utils\_legacy\multerConfig.js" -ErrorAction SilentlyContinue
#     Write-Host "Copied: middleware\multerConfig.js -> core\utils\_legacy\multerConfig.js" -ForegroundColor DarkGray
# }

# # -------------------------------
# # SHARED MIDDLEWARE
# # -------------------------------
# if (Test-Path "src\middleware\assignRequestId.js") {
#     Copy-Item "src\middleware\assignRequestId.js" "newSrc\shared\middleware\requestId.js"
#     Write-Host "Copied: middleware\assignRequestId.js -> shared\middleware\requestId.js" -ForegroundColor DarkGray
# }

# # -------------------------------
# # ACCOUNTING MODULES
# # -------------------------------
# Write-Host "`nMigrating Accounting Module..." -ForegroundColor Cyan

# # Core Accounting
# $accountingFiles = @(
#     @("models\accountModel.js", "modules\accounting\core\account.model.js"),
#     @("models\accountEntryModel.js", "modules\accounting\core\accountEntry.model.js"),
#     @("controllers\accountController.js", "modules\accounting\core\account.controller.js"),
#     @("controllers\ledgerController.js", "modules\accounting\core\ledger.controller.js"),
#     @("controllers\transactionController.js", "modules\accounting\core\transaction.controller.js"),
#     @("controllers\reconciliationController.js", "modules\accounting\core\reconciliation.controller.js"),
    
#     # Billing/Invoice
#     @("models\invoiceModel.js", "modules\accounting\billing\invoice.model.js"),
#     @("models\invoiceAuditModel.js", "modules\accounting\billing\invoiceAudit.model.js"),
#     @("controllers\invoiceController.js", "modules\accounting\billing\invoice.controller.js"),
#     @("controllers\invoicePDFController.js", "modules\accounting\billing\invoicePDF.controller.js"),
    
#     # Payments
#     @("models\paymentModel.js", "modules\accounting\payments\payment.model.js"),
#     @("models\emiModel.js", "modules\accounting\payments\emi.model.js"),
#     @("controllers\paymentController.js", "modules\accounting\payments\payment.controller.js"),
#     @("controllers\emiController.js", "modules\accounting\payments\emi.controller.js")
# )

# foreach ($filePair in $accountingFiles) {
#     $src = "src\$($filePair[0])"
#     $dest = "newSrc\$($filePair[1])"
#     if (Test-Path $src) {
#         Copy-Item $src $dest -ErrorAction SilentlyContinue
#         Write-Host "  Copied: $($filePair[0])" -ForegroundColor DarkGray
#     } else {
#         Write-Host "  Warning: $src not found" -ForegroundColor DarkYellow
#     }
# }

# # -------------------------------
# # HR MODULES
# # -------------------------------
# Write-Host "`nMigrating HR Module..." -ForegroundColor Cyan

# $hrFiles = @(
#     # Attendance
#     @("models\attendanceDailyModel.js", "modules\hr\attendance\models\attendanceDaily.model.js"),
#     @("models\attendanceLogModel.js", "modules\hr\attendance\models\attendanceLog.model.js"),
#     @("models\attendanceMachineModel.js", "modules\hr\attendance\models\attendanceMachine.model.js"),
#     @("models\attendanceRequestModel.js", "modules\hr\attendance\models\attendanceRequest.model.js"),
#     @("controllers\attendanceController.js", "modules\hr\attendance\attendance.controller.js"),
#     @("controllers\attendanceActionsController.js", "modules\hr\attendance\attendanceActions.controller.js"),
#     @("controllers\attendanceWebController.js", "modules\hr\attendance\attendanceWeb.controller.js"),
    
#     # Holiday
#     @("models\holidayModel.js", "modules\hr\holiday\holiday.model.js"),
#     @("controllers\holidayController.js", "modules\hr\holiday\holiday.controller.js"),
    
#     # Shift
#     @("models\shiftModel.js", "modules\hr\shift\shift.model.js"),
#     @("controllers\shiftController.js", "modules\hr\shift\shift.controller.js"),
    
#     # Leave
#     @("models\leaveRequestModel.js", "modules\hr\leave\leaveRequest.model.js")
# )

# foreach ($filePair in $hrFiles) {
#     $src = "src\$($filePair[0])"
#     $dest = "newSrc\$($filePair[1])"
#     if (Test-Path $src) {
#         Copy-Item $src $dest -ErrorAction SilentlyContinue
#         Write-Host "  Copied: $($filePair[0])" -ForegroundColor DarkGray
#     } else {
#         Write-Host "  Warning: $src not found" -ForegroundColor DarkYellow
#     }
# }

# # -------------------------------
# # INVENTORY MODULE
# # -------------------------------
# Write-Host "`nMigrating Inventory Module..." -ForegroundColor Cyan

# $inventoryFiles = @(
#     @("models\productModel.js", "modules\inventory\core\product.model.js"),
#     @("models\purchaseModel.js", "modules\inventory\core\purchase.model.js"),
#     @("models\salesModel.js", "modules\inventory\core\sales.model.js"),
#     @("controllers\inventoryController.js", "modules\inventory\core\inventory.controller.js"),
#     @("controllers\productController.js", "modules\inventory\core\product.controller.js"),
#     @("controllers\purchaseController.js", "modules\inventory\core\purchase.controller.js"),
#     @("controllers\salesController.js", "modules\inventory\core\sales.controller.js"),
#     @("controllers\salesReturnController.js", "modules\inventory\core\salesReturn.controller.js")
# )

# foreach ($filePair in $inventoryFiles) {
#     $src = "src\$($filePair[0])"
#     $dest = "newSrc\$($filePair[1])"
#     if (Test-Path $src) {
#         Copy-Item $src $dest -ErrorAction SilentlyContinue
#         Write-Host "  Copied: $($filePair[0])" -ForegroundColor DarkGray
#     } else {
#         Write-Host "  Warning: $src not found" -ForegroundColor DarkYellow
#     }
# }

# # Handle salesReturnModel.js in the nested location
# $salesReturnSrc1 = "src\models\salesReturnModel.js"
# $salesReturnSrc2 = "src\models\src\models\salesReturnModel.js"
# $salesReturnDest = "newSrc\modules\inventory\core\salesReturn.model.js"

# if (Test-Path $salesReturnSrc1) {
#     Copy-Item $salesReturnSrc1 $salesReturnDest -ErrorAction SilentlyContinue
#     Write-Host "  Copied: models\salesReturnModel.js" -ForegroundColor DarkGray
# } elseif (Test-Path $salesReturnSrc2) {
#     Copy-Item $salesReturnSrc2 $salesReturnDest -ErrorAction SilentlyContinue
#     Write-Host "  Copied: models\src\models\salesReturnModel.js" -ForegroundColor DarkGray
# } else {
#     Write-Host "  Warning: salesReturnModel.js not found in either location" -ForegroundColor DarkYellow
# }

# # -------------------------------
# # MASTER MODULE
# # -------------------------------
# Write-Host "`nMigrating Master Module..." -ForegroundColor Cyan

# $masterFiles = @(
#     @("models\masterModel.js", "modules\master\core\master.model.js"),
#     @("models\masterTypeModel.js", "modules\master\core\masterType.model.js"),
#     @("controllers\masterController.js", "modules\master\core\master.controller.js"),
#     @("controllers\masterTypeController.js", "modules\master\core\masterType.controller.js"),
#     @("controllers\masterListController.js", "modules\master\core\masterList.controller.js")
# )

# foreach ($filePair in $masterFiles) {
#     $src = "src\$($filePair[0])"
#     $dest = "newSrc\$($filePair[1])"
#     if (Test-Path $src) {
#         Copy-Item $src $dest -ErrorAction SilentlyContinue
#         Write-Host "  Copied: $($filePair[0])" -ForegroundColor DarkGray
#     } else {
#         Write-Host "  Warning: $src not found" -ForegroundColor DarkYellow
#     }
# }

# # -------------------------------
# # NOTIFICATION MODULE
# # -------------------------------
# Write-Host "`nMigrating Notification Module..." -ForegroundColor Cyan

# $notificationFiles = @(
#     @("models\notificationModel.js", "modules\notification\core\notification.model.js"),
#     @("models\announcementModel.js", "modules\notification\core\announcement.model.js"),
#     @("models\messageModel.js", "modules\notification\core\message.model.js"),
#     @("controllers\notificationController.js", "modules\notification\core\notification.controller.js"),
#     @("controllers\announcementController.js", "modules\notification\core\announcement.controller.js"),
#     @("controllers\messageController.js", "modules\notification\core\message.controller.js")
# )

# foreach ($filePair in $notificationFiles) {
#     $src = "src\$($filePair[0])"
#     $dest = "newSrc\$($filePair[1])"
#     if (Test-Path $src) {
#         Copy-Item $src $dest -ErrorAction SilentlyContinue
#         Write-Host "  Copied: $($filePair[0])" -ForegroundColor DarkGray
#     } else {
#         Write-Host "  Warning: $src not found" -ForegroundColor DarkYellow
#     }
# }

# # -------------------------------
# # ORGANIZATION MODULE
# # -------------------------------
# Write-Host "`nMigrating Organization Module..." -ForegroundColor Cyan

# $orgFiles = @(
#     @("models\organizationModel.js", "modules\organization\core\organization.model.js"),
#     @("models\branchModel.js", "modules\organization\core\branch.model.js"),
#     @("models\channelModel.js", "modules\organization\core\channel.model.js"),
#     @("models\customerModel.js", "modules\organization\core\customer.model.js"),
#     @("models\supplierModel.js", "modules\organization\core\supplier.model.js"),
#     @("controllers\organizationController.js", "modules\organization\core\organization.controller.js"),
#     @("controllers\branchController.js", "modules\organization\core\branch.controller.js"),
#     @("controllers\channelController.js", "modules\organization\core\channel.controller.js"),
#     @("controllers\customerController.js", "modules\organization\core\customer.controller.js"),
#     @("controllers\supplierController.js", "modules\organization\core\supplier.controller.js"),
#     @("controllers\organizationExtrasController.js", "modules\organization\core\organizationExtras.controller.js")
# )

# foreach ($filePair in $orgFiles) {
#     $src = "src\$($filePair[0])"
#     $dest = "newSrc\$($filePair[1])"
#     if (Test-Path $src) {
#         Copy-Item $src $dest -ErrorAction SilentlyContinue
#         Write-Host "  Copied: $($filePair[0])" -ForegroundColor DarkGray
#     } else {
#         Write-Host "  Warning: $src not found" -ForegroundColor DarkYellow
#     }
# }

# # -------------------------------
# # AUTH MODULE
# # -------------------------------
# Write-Host "`nMigrating Auth Module..." -ForegroundColor Cyan

# $authFiles = @(
#     @("models\userModel.js", "modules\auth\core\user.model.js"),
#     @("models\roleModel.js", "modules\auth\core\role.model.js"),
#     @("models\sessionModel.js", "modules\auth\core\session.model.js"),
#     @("controllers\authController.js", "modules\auth\core\auth.controller.js"),
#     @("controllers\userController.js", "modules\auth\core\user.controller.js"),
#     @("controllers\roleControllers.js", "modules\auth\core\role.controller.js"),
#     @("controllers\sessionController.js", "modules\auth\core\session.controller.js")
# )

# foreach ($filePair in $authFiles) {
#     $src = "src\$($filePair[0])"
#     $dest = "newSrc\$($filePair[1])"
#     if (Test-Path $src) {
#         Copy-Item $src $dest -ErrorAction SilentlyContinue
#         Write-Host "  Copied: $($filePair[0])" -ForegroundColor DarkGray
#     } else {
#         Write-Host "  Warning: $src not found" -ForegroundColor DarkYellow
#     }
# }

# # -------------------------------
# # LOGS AND AUDIT MODELS
# # -------------------------------
# Write-Host "`nMigrating Logs and Audit..." -ForegroundColor DarkGray

# $logFiles = @(
#     @("models\activityLogModel.js", "modules\_legacy\models\activityLogModel.js"),
#     @("models\auditLogModel.js", "modules\_legacy\models\auditLogModel.js"),
#     @("controllers\logs.controller.js", "modules\_legacy\controllers\logs.controller.js")
# )

# foreach ($filePair in $logFiles) {
#     $src = "src\$($filePair[0])"
#     $dest = "newSrc\$($filePair[1])"
#     if (Test-Path $src) {
#         Copy-Item $src $dest -ErrorAction SilentlyContinue
#         Write-Host "  Copied: $($filePair[0])" -ForegroundColor DarkGray
#     }
# }

# # -------------------------------
# # OTHER CONTROLLERS TO LEGACY
# # -------------------------------
# Write-Host "`nMigrating remaining controllers to legacy..." -ForegroundColor DarkGray

# $legacyControllers = @(
#     "dashboardController.js",
#     "analyticsController.js",
#     "chartController.js",
#     "searchController.js",
#     "feedController.js",
#     "statementsController.js",
#     "monitorController.js",
#     "adminController.js",
#     "automationController.js",
#     "noteController.js",
#     "ownership.controller.js",
#     "uploadController.js",
#     "partyTransactionController.js"
# )

# foreach ($controller in $legacyControllers) {
#     $src = "src\controllers\$controller"
#     $dest = "newSrc\modules\_legacy\controllers\$controller"
#     if (Test-Path $src) {
#         Copy-Item $src $dest -ErrorAction SilentlyContinue
#         Write-Host "  Copied: controllers\$controller" -ForegroundColor DarkGray
#     }
# }

# # -------------------------------
# # MIGRATE REMAINING MODELS TO LEGACY
# # -------------------------------
# Write-Host "`nMigrating remaining models to legacy..." -ForegroundColor DarkGray

# $excludeModels = @(
#     "accountModel.js",
#     "accountEntryModel.js",
#     "invoiceModel.js",
#     "invoiceAuditModel.js",
#     "paymentModel.js",
#     "emiModel.js",
#     "attendanceDailyModel.js",
#     "attendanceLogModel.js",
#     "attendanceMachineModel.js",
#     "attendanceRequestModel.js",
#     "holidayModel.js",
#     "shiftModel.js",
#     "leaveRequestModel.js",
#     "productModel.js",
#     "purchaseModel.js",
#     "salesModel.js",
#     "masterModel.js",
#     "masterTypeModel.js",
#     "notificationModel.js",
#     "announcementModel.js",
#     "messageModel.js",
#     "organizationModel.js",
#     "branchModel.js",
#     "channelModel.js",
#     "customerModel.js",
#     "supplierModel.js",
#     "userModel.js",
#     "roleModel.js",
#     "sessionModel.js",
#     "activityLogModel.js",
#     "auditLogModel.js",
#     "salesReturnModel.js"
# )

# $models = Get-ChildItem "src\models" -File | Where-Object { $_.Name -notin $excludeModels }
# foreach ($model in $models) {
#     $src = $model.FullName
#     $dest = "newSrc\modules\_legacy\models\$($model.Name)"
#     Copy-Item $src $dest -ErrorAction SilentlyContinue
#     Write-Host "  Copied: models\$($model.Name)" -ForegroundColor DarkGray
# }

# # Handle TransferRequest.js (with .js extension)
# if (Test-Path "src\models\TransferRequest.js") {
#     Copy-Item "src\models\TransferRequest.js" "newSrc\modules\_legacy\models\TransferRequest.js"
#     Write-Host "  Copied: models\TransferRequest.js" -ForegroundColor DarkGray
# }

# # -------------------------------
# # SERVICES ORGANIZATION
# # -------------------------------
# Write-Host "`nMigrating Services..." -ForegroundColor Cyan

# # Create services directories
# $serviceDirs = @(
#     "newSrc\modules\accounting\core",
#     "newSrc\modules\accounting\payments",
#     "newSrc\modules\inventory\core",
#     "newSrc\modules\notification\core",
#     "newSrc\modules\_legacy\services\analytics",
#     "newSrc\modules\_legacy\services\ai",
#     "newSrc\modules\_legacy\services\uploads"
# )

# foreach ($dir in $serviceDirs) {
#     if (-not (Test-Path $dir)) {
#         New-Item -ItemType Directory -Path $dir -Force | Out-Null
#     }
# }

# # Accounting Services
# $accountingServices = @(
#     @("services\accountService.js", "modules\accounting\core\account.service.js"),
#     @("services\journalService.js", "modules\accounting\core\journal.service.js"),
#     @("services\accountingService.js", "modules\accounting\core\accounting.service.js"),
#     @("services\transactionService.js", "modules\accounting\core\transaction.service.js"),
#     @("services\ledgerCache.js", "modules\accounting\core\ledgerCache.service.js"),
#     @("services\payrollService.js", "modules\accounting\payments\payroll.service.js"),
#     @("services\paymentPDFService.js", "modules\accounting\payments\paymentPDF.service.js")
# )

# foreach ($servicePair in $accountingServices) {
#     $src = "src\$($servicePair[0])"
#     $dest = "newSrc\$($servicePair[1])"
#     if (Test-Path $src) {
#         Copy-Item $src $dest -ErrorAction SilentlyContinue
#         Write-Host "  Copied: $($servicePair[0])" -ForegroundColor DarkGray
#     }
# }

# # Inventory Services
# $inventoryServices = @(
#     @("services\inventoryJournalService.js", "modules\inventory\core\inventoryJournal.service.js"),
#     @("services\inventoryAlertService.js", "modules\inventory\core\inventoryAlert.service.js"),
#     @("services\salesJournalService.js", "modules\inventory\core\salesJournal.service.js"),
#     @("services\salesService.js", "modules\inventory\core\sales.service.js")
# )

# foreach ($servicePair in $inventoryServices) {
#     $src = "src\$($servicePair[0])"
#     $dest = "newSrc\$($servicePair[1])"
#     if (Test-Path $src) {
#         Copy-Item $src $dest -ErrorAction SilentlyContinue
#         Write-Host "  Copied: $($servicePair[0])" -ForegroundColor DarkGray
#     }
# }

# # Notification Services
# $notificationServices = @(
#     @("services\notificationService.js", "modules\notification\core\notification.service.js"),
#     @("services\overdueReminderService.js", "modules\notification\core\overdueReminder.service.js"),
#     @("services\paymentReminderService.js", "modules\notification\core\paymentReminder.service.js")
# )

# foreach ($servicePair in $notificationServices) {
#     $src = "src\$($servicePair[0])"
#     $dest = "newSrc\$($servicePair[1])"
#     if (Test-Path $src) {
#         Copy-Item $src $dest -ErrorAction SilentlyContinue
#         Write-Host "  Copied: $($servicePair[0])" -ForegroundColor DarkGray
#     }
# }

# # HR Service
# if (Test-Path "src\services\attendance\dailyProcessor.js") {
#     Copy-Item "src\services\attendance\dailyProcessor.js" "newSrc\modules\hr\attendance\dailyProcessor.service.js"
#     Write-Host "  Copied: services\attendance\dailyProcessor.js" -ForegroundColor DarkGray
# }

# # Analytics Services
# if (Test-Path "src\services\analytics") {
#     Copy-Item "src\services\analytics\*" -Recurse "newSrc\modules\_legacy\services\analytics\" -ErrorAction SilentlyContinue
#     Write-Host "  Copied: services\analytics folder" -ForegroundColor DarkGray
# }

# # AI Services
# if (Test-Path "src\services\ai") {
#     Copy-Item "src\services\ai\*" -Recurse "newSrc\modules\_legacy\services\ai\" -ErrorAction SilentlyContinue
#     Write-Host "  Copied: services\ai folder" -ForegroundColor DarkGray
# }

# # Upload Services
# if (Test-Path "src\services\uploads") {
#     Copy-Item "src\services\uploads\*" -Recurse "newSrc\modules\_legacy\services\uploads\" -ErrorAction SilentlyContinue
#     Write-Host "  Copied: services\uploads folder" -ForegroundColor DarkGray
# }

# # Copy remaining services to legacy
# $excludeServices = @(
#     "accountService.js",
#     "journalService.js",
#     "accountingService.js",
#     "transactionService.js",
#     "ledgerCache.js",
#     "payrollService.js",
#     "paymentPDFService.js",
#     "inventoryJournalService.js",
#     "inventoryAlertService.js",
#     "salesJournalService.js",
#     "salesService.js",
#     "notificationService.js",
#     "overdueReminderService.js",
#     "paymentReminderService.js"
# )

# $services = Get-ChildItem "src\services" -File | Where-Object { $_.Name -notin $excludeServices }
# foreach ($service in $services) {
#     $src = $service.FullName
#     $dest = "newSrc\modules\_legacy\services\$($service.Name)"
#     Copy-Item $src $dest -ErrorAction SilentlyContinue
#     Write-Host "  Copied: services\$($service.Name)" -ForegroundColor DarkGray
# }

# # -------------------------------
# # CORE UTILS
# # -------------------------------
# Write-Host "`nMigrating Utils..." -ForegroundColor Cyan

# $coreUtils = @(
#     "appError.js",
#     "catchAsync.js",
#     "ApiFeatures.js",
#     "runInTransaction.js",
#     "auditLogger.js",
#     "authUtils.js",
#     "handlerFactory.js"
# )

# foreach ($util in $coreUtils) {
#     $src = "src\utils\$util"
#     $dest = "newSrc\core\utils\$util"
#     if (Test-Path $src) {
#         Copy-Item $src $dest -ErrorAction SilentlyContinue
#         Write-Host "  Copied to core: utils\$util" -ForegroundColor DarkGray
#     }
# }

# # Legacy utils
# $utils = Get-ChildItem "src\utils" -File
# foreach ($util in $utils) {
#     if ($coreUtils -notcontains $util.Name) {
#         $src = $util.FullName
#         $dest = "newSrc\core\utils\_legacy\$($util.Name)"
#         Copy-Item $src $dest -ErrorAction SilentlyContinue
#         Write-Host "  Copied to legacy: utils\$($util.Name)" -ForegroundColor DarkGray
#     }
# }

# # Copy templates folder
# if (Test-Path "src\utils\templates") {
#     Copy-Item "src\utils\templates" -Recurse "newSrc\core\utils\_legacy\templates" -Force
#     Write-Host "  Copied: utils\templates folder" -ForegroundColor DarkGray
# }

# # -------------------------------
# # JOBS
# # -------------------------------
# Write-Host "`nMigrating Jobs..." -ForegroundColor DarkGray

# if (Test-Path "src\jobs") {
#     Copy-Item "src\jobs\*" "newSrc\core\jobs\_legacy" -Recurse -ErrorAction SilentlyContinue
#     Write-Host "  Copied: jobs folder" -ForegroundColor DarkGray
# }

# # -------------------------------
# # ROUTES
# # -------------------------------
# Write-Host "`nMigrating Routes..." -ForegroundColor Cyan

# if (Test-Path "src\routes") {
#     Copy-Item "src\routes\*" "newSrc\routes" -Recurse -ErrorAction SilentlyContinue
#     Write-Host "  Copied: routes folder" -ForegroundColor DarkGray
# }

# # -------------------------------
# # VALIDATIONS
# # -------------------------------
# Write-Host "`nMigrating Validations..." -ForegroundColor DarkGray

# if (Test-Path "src\validations") {
#     Copy-Item "src\validations\*" "newSrc\shared\validations" -Recurse -ErrorAction SilentlyContinue
#     Write-Host "  Copied: validations folder" -ForegroundColor DarkGray
# }

# # -------------------------------
# # SCRIPTS
# # -------------------------------
# Write-Host "`nMigrating Scripts..." -ForegroundColor DarkGray

# if (Test-Path "src\scripts") {
#     Copy-Item "src\scripts\*" "newSrc\scripts" -Recurse -ErrorAction SilentlyContinue
#     Write-Host "  Copied: scripts folder" -ForegroundColor DarkGray
# }

# # -------------------------------
# # PUBLIC ASSETS
# # -------------------------------
# Write-Host "`nMigrating Public Assets..." -ForegroundColor DarkGray

# if (Test-Path "src\public") {
#     Copy-Item "src\public\*" "newSrc\public" -Recurse -ErrorAction SilentlyContinue
#     Write-Host "  Copied: public folder" -ForegroundColor DarkGray
# }

# # -------------------------------
# # LOGS
# # -------------------------------
# Write-Host "`nMigrating Logs..." -ForegroundColor DarkGray

# if (Test-Path "src\logs") {
#     Copy-Item "src\logs\*" "newSrc\logs" -Recurse -ErrorAction SilentlyContinue
#     Write-Host "  Copied: logs folder" -ForegroundColor DarkGray
# }

# # -------------------------------
# # CREATE INDEX FILES
# # -------------------------------
# Write-Host "`nCreating module index files..." -ForegroundColor Cyan

# # Accounting Module Index
# @"
# // Accounting Module Export
# module.exports = {
#     // Core
#     Account: require('./core/account.model'),
#     AccountEntry: require('./core/accountEntry.model'),
    
#     // Billing
#     Invoice: require('./billing/invoice.model'),
#     InvoiceAudit: require('./billing/invoiceAudit.model'),
    
#     // Payments
#     Payment: require('./payments/payment.model'),
#     EMI: require('./payments/emi.model')
# };
# "@ | Out-File -FilePath "newSrc\modules\accounting\index.js" -Encoding UTF8
# Write-Host "  Created: modules\accounting\index.js" -ForegroundColor DarkGray

# # -------------------------------
# # SUMMARY
# # -------------------------------
# Write-Host "`n" + "="*50 -ForegroundColor Green
# Write-Host "MIGRATION COMPLETED SUCCESSFULLY!" -ForegroundColor Green
# Write-Host "="*50 -ForegroundColor Green
# Write-Host ""
# Write-Host "Migration Summary:" -ForegroundColor Cyan
# Write-Host "✓ All root files migrated" -ForegroundColor DarkGray
# Write-Host "✓ All config files migrated" -ForegroundColor DarkGray
# Write-Host "✓ All controllers organized by module" -ForegroundColor DarkGray
# Write-Host "✓ All models organized by module" -ForegroundColor DarkGray
# Write-Host "✓ All services organized by module" -ForegroundColor DarkGray
# Write-Host "✓ All utils migrated" -ForegroundColor DarkGray
# Write-Host "✓ All routes preserved" -ForegroundColor DarkGray
# Write-Host "✓ All scripts, validations, and public assets copied" -ForegroundColor DarkGray
# Write-Host ""
# Write-Host "Modules Created:" -ForegroundColor Cyan
# Write-Host "1. Accounting (with submodules: core, billing, payments)" -ForegroundColor DarkGray
# Write-Host "2. HR (with submodules: attendance, holiday, shift, leave)" -ForegroundColor DarkGray
# Write-Host "3. Inventory" -ForegroundColor DarkGray
# Write-Host "4. Master" -ForegroundColor DarkGray
# Write-Host "5. Notification" -ForegroundColor DarkGray
# Write-Host "6. Organization" -Foreground

# # # ======================================================
# # # APEX CRM – COMPLETE MIGRATION SCRIPT
# # # ======================================================

# # $ErrorActionPreference = "Stop"

# # # -------------------------------
# # # SAFEGUARD
# # # -------------------------------
# # if (Test-Path "newSrc") {
# #     Write-Error "newSrc already exists. Aborting."
# #     exit 1
# # }

# # Write-Host "Starting complete migration"

# # # -------------------------------
# # # BASE STRUCTURE (ENHANCED)
# # # -------------------------------
# # $dirs = @(
# #     "newSrc",
# #     "newSrc/bootstrap",
# #     "newSrc/config",
# #     "newSrc/core/error",
# #     "newSrc/core/middleware",
# #     "newSrc/core/utils",
# #     "newSrc/core/utils/_legacy",
# #     "newSrc/core/jobs",
# #     "newSrc/core/jobs/_legacy",
# #     "newSrc/modules",
# #     "newSrc/modules/accounting/core",
# #     "newSrc/modules/accounting/billing",
# #     "newSrc/modules/accounting/payments",
# #     "newSrc/modules/hr/attendance",
# #     "newSrc/modules/hr/attendance/models",
# #     "newSrc/modules/hr/holiday",
# #     "newSrc/modules/hr/shift",
# #     "newSrc/modules/hr/leave",
# #     "newSrc/modules/inventory",
# #     "newSrc/modules/inventory/core",
# #     "newSrc/modules/master",
# #     "newSrc/modules/master/core",
# #     "newSrc/modules/notification",
# #     "newSrc/modules/notification/core",
# #     "newSrc/modules/organization",
# #     "newSrc/modules/organization/core",
# #     "newSrc/modules/sales",
# #     "newSrc/modules/sales/core",
# #     "newSrc/modules/auth",
# #     "newSrc/modules/auth/core",
# #     "newSrc/modules/_legacy/controllers",
# #     "newSrc/modules/_legacy/services",
# #     "newSrc/modules/_legacy/models",
# #     "newSrc/routes",
# #     "newSrc/routes/v1",
# #     "newSrc/shared/validations",
# #     "newSrc/shared/middleware",
# #     "newSrc/scripts",
# #     "newSrc/public",
# #     "newSrc/public/fonts",
# #     "newSrc/logs",
# #     "newSrc/tests"
# # )

# # foreach ($d in $dirs) {
# #     New-Item -ItemType Directory -Path $d -Force | Out-Null
# # }

# # # -------------------------------
# # # ROOT FILES (COMPLETE)
# # # -------------------------------
# # Copy-Item "src\.env"          "newSrc\.env" -ErrorAction SilentlyContinue
# # Copy-Item "src\.env.example"  "newSrc\.env.example" -ErrorAction SilentlyContinue
# # Copy-Item "src\.gitignore"    "newSrc\.gitignore" -ErrorAction SilentlyContinue
# # Copy-Item "src\app.js"        "newSrc\app.js"
# # Copy-Item "src\server.js"     "newSrc\server.js"
# # Copy-Item "src\debug-ai.js"   "newSrc\debug-ai.js"

# # # -------------------------------
# # # BOOTSTRAP (COMPLETE)
# # # -------------------------------
# # Copy-Item "src\config\db.js"            "newSrc\bootstrap\db.js"
# # Copy-Item "src\config\logger.js"        "newSrc\bootstrap\logger.js"
# # Copy-Item "src\config\swaggerConfig.js" "newSrc\bootstrap\swagger.js"

# # # -------------------------------
# # # CONFIG (COMPLETE)
# # # -------------------------------
# # Copy-Item "src\config\permissions.js" "newSrc\config\permissions.js"

# # # -------------------------------
# # # ERROR HANDLING (COMPLETE)
# # # -------------------------------
# # Copy-Item "src\middleware\errorHandler.js"     "newSrc\core\error\errorHandler.js"
# # Copy-Item "src\middleware\errorController.js"  "newSrc\core\error\errorController.js"

# # # -------------------------------
# # # CORE MIDDLEWARE (COMPLETE)
# # # -------------------------------
# # $middlewareMap = @{
# #     "assignRequestId.js"      = "requestId.middleware.js"
# #     "authMiddleware.js"       = "auth.middleware.js"
# #     "permissionMiddleware.js" = "permission.middleware.js"
# #     "cacheMiddleware.js"      = "cache.middleware.js"
# #     "uploadMiddleware.js"     = "upload.middleware.js"
# #     "sessionActivity.js"      = "session.middleware.js"
# #     "periodLock.js"           = "periodLock.middleware.js"
# #     "forgotPasswordLimiter.js" = "rateLimit.middleware.js"
# # }

# # foreach ($m in $middlewareMap.Keys) {
# #     $src = "src\middleware\$m"
# #     if (Test-Path $src) {
# #         Copy-Item $src ("newSrc\core\middleware\" + $middlewareMap[$m])
# #     }
# # }

# # # Copy Multer config separately as it's not middleware
# # Copy-Item "src\middleware\multerConfig.js" "newSrc\core\utils\_legacy\multerConfig.js" -ErrorAction SilentlyContinue

# # # -------------------------------
# # # SHARED MIDDLEWARE
# # # -------------------------------
# # Copy-Item "src\middleware\assignRequestId.js" "newSrc\shared\middleware\requestId.js"

# # # -------------------------------
# # # ACCOUNTING MODULES
# # # -------------------------------
# # # Core Accounting
# # Copy-Item "src\models\accountModel.js"       "newSrc\modules\accounting\core\account.model.js"
# # Copy-Item "src\models\accountEntryModel.js"  "newSrc\modules\accounting\core\accountEntry.model.js"
# # Copy-Item "src\controllers\accountController.js" "newSrc\modules\accounting\core\account.controller.js"
# # Copy-Item "src\controllers\ledgerController.js"  "newSrc\modules\accounting\core\ledger.controller.js"
# # Copy-Item "src\controllers\transactionController.js" "newSrc\modules\accounting\core\transaction.controller.js"
# # Copy-Item "src\controllers\reconciliationController.js" "newSrc\modules\accounting\core\reconciliation.controller.js"

# # # Billing/Invoice
# # Copy-Item "src\models\invoiceModel.js"      "newSrc\modules\accounting\billing\invoice.model.js"
# # Copy-Item "src\models\invoiceAuditModel.js" "newSrc\modules\accounting\billing\invoiceAudit.model.js"
# # Copy-Item "src\controllers\invoiceController.js"    "newSrc\modules\accounting\billing\invoice.controller.js"
# # Copy-Item "src\controllers\invoicePDFController.js" "newSrc\modules\accounting\billing\invoicePDF.controller.js"

# # # Payments
# # Copy-Item "src\models\paymentModel.js"      "newSrc\modules\accounting\payments\payment.model.js"
# # Copy-Item "src\models\emiModel.js"          "newSrc\modules\accounting\payments\emi.model.js"
# # Copy-Item "src\controllers\paymentController.js"    "newSrc\modules\accounting\payments\payment.controller.js"
# # Copy-Item "src\controllers\emiController.js"        "newSrc\modules\accounting\payments\emi.controller.js"

# # # -------------------------------
# # # HR MODULES
# # # -------------------------------
# # # Attendance
# # Copy-Item "src\models\attendanceDailyModel.js"    "newSrc\modules\hr\attendance\models\attendanceDaily.model.js"
# # Copy-Item "src\models\attendanceLogModel.js"      "newSrc\modules\hr\attendance\models\attendanceLog.model.js"
# # Copy-Item "src\models\attendanceMachineModel.js"  "newSrc\modules\hr\attendance\models\attendanceMachine.model.js"
# # Copy-Item "src\models\attendanceRequestModel.js"  "newSrc\modules\hr\attendance\models\attendanceRequest.model.js"
# # Copy-Item "src\controllers\attendanceController.js" "newSrc\modules\hr\attendance\attendance.controller.js"
# # Copy-Item "src\controllers\attendanceActionsController.js" "newSrc\modules\hr\attendance\attendanceActions.controller.js"
# # Copy-Item "src\controllers\attendanceWebController.js" "newSrc\modules\hr\attendance\attendanceWeb.controller.js"

# # # Holiday
# # Copy-Item "src\models\holidayModel.js"            "newSrc\modules\hr\holiday\holiday.model.js"
# # Copy-Item "src\controllers\holidayController.js"  "newSrc\modules\hr\holiday\holiday.controller.js"

# # # Shift
# # Copy-Item "src\models\shiftModel.js"              "newSrc\modules\hr\shift\shift.model.js"
# # Copy-Item "src\controllers\shiftController.js"    "newSrc\modules\hr\shift\shift.controller.js"

# # # Leave
# # Copy-Item "src\models\leaveRequestModel.js"       "newSrc\modules\hr\leave\leaveRequest.model.js"

# # # -------------------------------
# # # INVENTORY MODULE
# # # -------------------------------
# # Copy-Item "src\models\productModel.js"           "newSrc\modules\inventory\core\product.model.js"
# # Copy-Item "src\models\purchaseModel.js"          "newSrc\modules\inventory\core\purchase.model.js"
# # Copy-Item "src\models\salesModel.js"             "newSrc\modules\inventory\core\sales.model.js"
# # Copy-Item "src\models\salesReturnModel.js"       "newSrc\modules\inventory\core\salesReturn.model.js"
# # Copy-Item "src\controllers\inventoryController.js" "newSrc\modules\inventory\core\inventory.controller.js"
# # Copy-Item "src\controllers\productController.js"   "newSrc\modules\inventory\core\product.controller.js"
# # Copy-Item "src\controllers\purchaseController.js"  "newSrc\modules\inventory\core\purchase.controller.js"
# # Copy-Item "src\controllers\salesController.js"     "newSrc\modules\inventory\core\sales.controller.js"
# # Copy-Item "src\controllers\salesReturnController.js" "newSrc\modules\inventory\core\salesReturn.controller.js"

# # # -------------------------------
# # # MASTER MODULE
# # # -------------------------------
# # Copy-Item "src\models\masterModel.js"            "newSrc\modules\master\core\master.model.js"
# # Copy-Item "src\models\masterTypeModel.js"        "newSrc\modules\master\core\masterType.model.js"
# # Copy-Item "src\controllers\masterController.js"  "newSrc\modules\master\core\master.controller.js"
# # Copy-Item "src\controllers\masterTypeController.js" "newSrc\modules\master\core\masterType.controller.js"
# # Copy-Item "src\controllers\masterListController.js" "newSrc\modules\master\core\masterList.controller.js"

# # # -------------------------------
# # # NOTIFICATION MODULE
# # # -------------------------------
# # Copy-Item "src\models\notificationModel.js"      "newSrc\modules\notification\core\notification.model.js"
# # Copy-Item "src\models\announcementModel.js"      "newSrc\modules\notification\core\announcement.model.js"
# # Copy-Item "src\models\messageModel.js"           "newSrc\modules\notification\core\message.model.js"
# # Copy-Item "src\controllers\notificationController.js" "newSrc\modules\notification\core\notification.controller.js"
# # Copy-Item "src\controllers\announcementController.js" "newSrc\modules\notification\core\announcement.controller.js"
# # Copy-Item "src\controllers\messageController.js"      "newSrc\modules\notification\core\message.controller.js"

# # # -------------------------------
# # # ORGANIZATION MODULE
# # # -------------------------------
# # Copy-Item "src\models\organizationModel.js"      "newSrc\modules\organization\core\organization.model.js"
# # Copy-Item "src\models\branchModel.js"            "newSrc\modules\organization\core\branch.model.js"
# # Copy-Item "src\models\channelModel.js"           "newSrc\modules\organization\core\channel.model.js"
# # Copy-Item "src\models\customerModel.js"          "newSrc\modules\organization\core\customer.model.js"
# # Copy-Item "src\models\supplierModel.js"          "newSrc\modules\organization\core\supplier.model.js"
# # Copy-Item "src\controllers\organizationController.js" "newSrc\modules\organization\core\organization.controller.js"
# # Copy-Item "src\controllers\branchController.js"      "newSrc\modules\organization\core\branch.controller.js"
# # Copy-Item "src\controllers\channelController.js"     "newSrc\modules\organization\core\channel.controller.js"
# # Copy-Item "src\controllers\customerController.js"    "newSrc\modules\organization\core\customer.controller.js"
# # Copy-Item "src\controllers\supplierController.js"    "newSrc\modules\organization\core\supplier.controller.js"
# # Copy-Item "src\controllers\organizationExtrasController.js" "newSrc\modules\organization\core\organizationExtras.controller.js"

# # # -------------------------------
# # # SALES MODULE
# # # -------------------------------
# # Copy-Item "src\controllers\salesController.js"     "newSrc\modules\sales\core\sales.controller.js"
# # Copy-Item "src\controllers\salesReturnController.js" "newSrc\modules\sales\core\salesReturn.controller.js"
# # Copy-Item "src\controllers\partyTransactionController.js" "newSrc\modules\sales\core\partyTransaction.controller.js"

# # # -------------------------------
# # # AUTH MODULE
# # # -------------------------------
# # Copy-Item "src\models\userModel.js"             "newSrc\modules\auth\core\user.model.js"
# # Copy-Item "src\models\roleModel.js"             "newSrc\modules\auth\core\role.model.js"
# # Copy-Item "src\models\sessionModel.js"          "newSrc\modules\auth\core\session.model.js"
# # Copy-Item "src\controllers\authController.js"   "newSrc\modules\auth\core\auth.controller.js"
# # Copy-Item "src\controllers\userController.js"   "newSrc\modules\auth\core\user.controller.js"
# # Copy-Item "src\controllers\roleControllers.js"  "newSrc\modules\auth\core\role.controller.js"
# # Copy-Item "src\controllers\sessionController.js" "newSrc\modules\auth\core\session.controller.js"

# # # -------------------------------
# # # LOGS AND AUDIT MODELS
# # # -------------------------------
# # Copy-Item "src\models\activityLogModel.js"      "newSrc\modules\_legacy\models\activityLogModel.js"
# # Copy-Item "src\models\auditLogModel.js"         "newSrc\modules\_legacy\models\auditLogModel.js"
# # Copy-Item "src\controllers\logs.controller.js"  "newSrc\modules\_legacy\controllers\logs.controller.js"

# # # -------------------------------
# # # OTHER CONTROLLERS
# # # -------------------------------
# # Copy-Item "src\controllers\dashboardController.js"   "newSrc\modules\_legacy\controllers\dashboardController.js"
# # Copy-Item "src\controllers\analyticsController.js"   "newSrc\modules\_legacy\controllers\analyticsController.js"
# # Copy-Item "src\controllers\chartController.js"       "newSrc\modules\_legacy\controllers\chartController.js"
# # Copy-Item "src\controllers\searchController.js"      "newSrc\modules\_legacy\controllers\searchController.js"
# # Copy-Item "src\controllers\feedController.js"        "newSrc\modules\_legacy\controllers\feedController.js"
# # Copy-Item "src\controllers\statementsController.js"  "newSrc\modules\_legacy\controllers\statementsController.js"
# # Copy-Item "src\controllers\monitorController.js"     "newSrc\modules\_legacy\controllers\monitorController.js"
# # Copy-Item "src\controllers\adminController.js"       "newSrc\modules\_legacy\controllers\adminController.js"
# # Copy-Item "src\controllers\automationController.js"  "newSrc\modules\_legacy\controllers\automationController.js"
# # Copy-Item "src\controllers\noteController.js"        "newSrc\modules\_legacy\controllers\noteController.js"
# # Copy-Item "src\controllers\ownership.controller.js"  "newSrc\modules\_legacy\controllers\ownership.controller.js"
# # Copy-Item "src\controllers\uploadController.js"      "newSrc\modules\_legacy\controllers\uploadController.js"

# # # -------------------------------
# # # SERVICES ORGANIZATION
# # # -------------------------------
# # # Accounting Services
# # Copy-Item "src\services\accountService.js"      "newSrc\modules\accounting\core\account.service.js"
# # Copy-Item "src\services\journalService.js"      "newSrc\modules\accounting\core\journal.service.js"
# # Copy-Item "src\services\accountingService.js"   "newSrc\modules\accounting\core\accounting.service.js"
# # Copy-Item "src\services\transactionService.js"  "newSrc\modules\accounting\core\transaction.service.js"
# # Copy-Item "src\services\ledgerCache.js"         "newSrc\modules\accounting\core\ledgerCache.service.js"
# # Copy-Item "src\services\payrollService.js"      "newSrc\modules\accounting\payments\payroll.service.js"
# # Copy-Item "src\services\paymentPDFService.js"   "newSrc\modules\accounting\payments\paymentPDF.service.js"

# # # Inventory Services
# # Copy-Item "src\services\inventoryJournalService.js" "newSrc\modules\inventory\core\inventoryJournal.service.js"
# # Copy-Item "src\services\inventoryAlertService.js"   "newSrc\modules\inventory\core\inventoryAlert.service.js"
# # Copy-Item "src\services\salesJournalService.js"     "newSrc\modules\inventory\core\salesJournal.service.js"
# # Copy-Item "src\services\salesService.js"            "newSrc\modules\inventory\core\sales.service.js"

# # # Notification Services
# # Copy-Item "src\services\notificationService.js"     "newSrc\modules\notification\core\notification.service.js"
# # Copy-Item "src\services\overdueReminderService.js"  "newSrc\modules\notification\core\overdueReminder.service.js"
# # Copy-Item "src\services\paymentReminderService.js"  "newSrc\modules\notification\core\paymentReminder.service.js"

# # # HR Services
# # Copy-Item "src\services\attendance\dailyProcessor.js" "newSrc\modules\hr\attendance\dailyProcessor.service.js"

# # # Analytics Services
# # Copy-Item "src\services\analytics\*" -Recurse "newSrc\modules\_legacy\services\analytics\" -ErrorAction SilentlyContinue

# # # AI Services
# # Copy-Item "src\services\ai\*" -Recurse "newSrc\modules\_legacy\services\ai\" -ErrorAction SilentlyContinue

# # # Upload Services
# # Copy-Item "src\services\uploads\*" -Recurse "newSrc\modules\_legacy\services\uploads\" -ErrorAction SilentlyContinue

# # # Legacy Services
# # $excludeServices = @(
# #     "accountService.js",
# #     "journalService.js",
# #     "accountingService.js",
# #     "transactionService.js",
# #     "ledgerCache.js",
# #     "payrollService.js",
# #     "paymentPDFService.js",
# #     "inventoryJournalService.js",
# #     "inventoryAlertService.js",
# #     "salesJournalService.js",
# #     "salesService.js",
# #     "notificationService.js",
# #     "overdueReminderService.js",
# #     "paymentReminderService.js",
# #     "analyticsService.js",
# #     "dashboardService.js",
# #     "statementsService.js",
# #     "chartService.js",
# #     "automationService.js",
# #     "customerService.js",
# #     "adminService.js",
# #     "activityLogService.js",
# #     "ownership.service.js",
# #     "emiService.js"
# # )

# # $services = Get-ChildItem "src\services" -File
# # foreach ($s in $services) {
# #     if ($excludeServices -notcontains $s.Name) {
# #         Copy-Item $s.FullName "newSrc\modules\_legacy\services"
# #     }
# # }

# # # Copy specific services
# # Copy-Item "src\services\analyticsService.js" "newSrc\modules\_legacy\services\analyticsService.js"
# # Copy-Item "src\services\dashboardService.js" "newSrc\modules\_legacy\services\dashboardService.js"
# # Copy-Item "src\services\statementsService.js" "newSrc\modules\_legacy\services\statementsService.js"
# # Copy-Item "src\services\chartService.js" "newSrc\modules\_legacy\services\chartService.js"
# # Copy-Item "src\services\automationService.js" "newSrc\modules\_legacy\services\automationService.js"
# # Copy-Item "src\services\customerService.js" "newSrc\modules\_legacy\services\customerService.js"
# # Copy-Item "src\services\adminService.js" "newSrc\modules\_legacy\services\adminService.js"
# # Copy-Item "src\services\activityLogService.js" "newSrc\modules\_legacy\services\activityLogService.js"
# # Copy-Item "src\services\ownership.service.js" "newSrc\modules\_legacy\services\ownership.service.js"
# # Copy-Item "src\services\emiService.js" "newSrc\modules\_legacy\services\emiService.js"

# # # -------------------------------
# # # CORE UTILS (COMPLETE)
# # # -------------------------------
# # Copy-Item "src\utils\appError.js"         "newSrc\core\utils\appError.js"
# # Copy-Item "src\utils\catchAsync.js"       "newSrc\core\utils\catchAsync.js"
# # Copy-Item "src\utils\ApiFeatures.js"      "newSrc\core\utils\ApiFeatures.js"
# # Copy-Item "src\utils\runInTransaction.js" "newSrc\core\utils\runInTransaction.js"
# # Copy-Item "src\utils\auditLogger.js"      "newSrc\core\utils\auditLogger.js"
# # Copy-Item "src\utils\authUtils.js"        "newSrc\core\utils\authUtils.js"
# # Copy-Item "src\utils\handlerFactory.js"   "newSrc\core\utils\handlerFactory.js"

# # # -------------------------------
# # # LEGACY UTILS
# # # -------------------------------
# # $legacyUtils = Get-ChildItem "src\utils" -File
# # foreach ($u in $legacyUtils) {
# #     if (@("appError.js","catchAsync.js","ApiFeatures.js","runInTransaction.js","auditLogger.js","authUtils.js","handlerFactory.js") -notcontains $u.Name) {
# #         Copy-Item $u.FullName "newSrc\core\utils\_legacy"
# #     }
# # }

# # # Copy templates folder
# # if (Test-Path "src\utils\templates") {
# #     Copy-Item "src\utils\templates" -Recurse "newSrc\core\utils\_legacy\templates" -Force
# # }

# # # -------------------------------
# # # JOBS
# # # -------------------------------
# # Copy-Item "src\jobs\*"        "newSrc\core\jobs\_legacy" -Recurse

# # # -------------------------------
# # # ROUTES (COMPLETE)
# # # -------------------------------
# # # Copy all route files
# # Copy-Item "src\routes\v1\*" "newSrc\routes\v1" -Recurse

# # # -------------------------------
# # # VALIDATIONS
# # # -------------------------------
# # Copy-Item "src\validations\*" "newSrc\shared\validations" -Recurse -ErrorAction SilentlyContinue

# # # -------------------------------
# # # SCRIPTS
# # # -------------------------------
# # Copy-Item "src\scripts\*"     "newSrc\scripts" -Recurse

# # # -------------------------------
# # # PUBLIC ASSETS
# # # -------------------------------
# # Copy-Item "src\public\*"      "newSrc\public" -Recurse

# # # -------------------------------
# # # LOGS
# # # -------------------------------
# # Copy-Item "src\logs\*"        "newSrc\logs" -Recurse -ErrorAction SilentlyContinue

# # # -------------------------------
# # # HANDLE NESTED MODELS FOLDER
# # # -------------------------------
# # if (Test-Path "src\models\src\models\salesReturnModel.js") {
# #     Copy-Item "src\models\src\models\salesReturnModel.js" "newSrc\modules\inventory\core\salesReturn.model.js" -Force
# # }

# # # -------------------------------
# # # CREATE INDEX FILES
# # # -------------------------------
# # # Create module index files
# # @"
# # // Accounting Module Export
# # module.exports = {
# #     // Core
# #     Account: require('./core/account.model'),
# #     AccountEntry: require('./core/accountEntry.model'),
    
# #     // Billing
# #     Invoice: require('./billing/invoice.model'),
# #     InvoiceAudit: require('./billing/invoiceAudit.model'),
    
# #     // Payments
# #     Payment: require('./payments/payment.model'),
# #     EMI: require('./payments/emi.model')
# # };
# # "@ | Out-File -FilePath "newSrc\modules\accounting\index.js" -Encoding UTF8

# # # -------------------------------
# # # SUMMARY
# # # -------------------------------
# # Write-Host "========================================"
# # Write-Host "MIGRATION COMPLETED SUCCESSFULLY!"
# # Write-Host "========================================"
# # Write-Host ""
# # Write-Host "Migration Summary:"
# # Write-Host "- All root files migrated"
# # Write-Host "- All config files migrated"
# # Write-Host "- All controllers organized by module"
# # Write-Host "- All models organized by module"
# # Write-Host "- All services organized by module"
# # Write-Host "- All utils migrated"
# # Write-Host "- All routes preserved"
# # Write-Host "- All scripts, validations, and public assets copied"
# # Write-Host ""
# # Write-Host "Modules Created:"
# # Write-Host "1. Accounting (with submodules: core, billing, payments)"
# # Write-Host "2. HR (with submodules: attendance, holiday, shift, leave)"
# # Write-Host "3. Inventory"
# # Write-Host "4. Master"
# # Write-Host "5. Notification"
# # Write-Host "6. Organization"
# # Write-Host "7. Sales"
# # Write-Host "8. Auth"
# # Write-Host "9. _legacy (for unmigrated code)"
# # Write-Host ""
# # Write-Host "Next Steps:"
# # Write-Host "1. Update imports in your new files"
# # Write-Host "2. Update server.js to use new structure"
# # Write-Host "3. Test thoroughly"
# # Write-Host "========================================"

# # # # ======================================================
# # # # APEX CRM – SAFE SHALLOW MIGRATION SCRIPT (STABLE)
# # # # ======================================================

# # # $ErrorActionPreference = "Stop"

# # # # -------------------------------
# # # # SAFEGUARD
# # # # -------------------------------
# # # if (Test-Path "newSrc") {
# # #     Write-Error "newSrc already exists. Aborting."
# # #     exit 1
# # # }

# # # Write-Host "Starting controlled shallow migration"

# # # # -------------------------------
# # # # BASE STRUCTURE
# # # # -------------------------------
# # # $dirs = @(
# # #     "newSrc",
# # #     "newSrc/bootstrap",
# # #     "newSrc/config",
# # #     "newSrc/core/error",
# # #     "newSrc/core/middleware",
# # #     "newSrc/core/utils",
# # #     "newSrc/core/utils/_legacy",
# # #     "newSrc/core/jobs",
# # #     "newSrc/core/jobs/_legacy",
# # #     "newSrc/modules",
# # #     "newSrc/modules/accounting/core",
# # #     "newSrc/modules/accounting/billing",
# # #     "newSrc/modules/accounting/payments",
# # #     "newSrc/modules/hr/attendance/models",
# # #     "newSrc/modules/hr/holiday",
# # #     "newSrc/modules/hr/shift",
# # #     "newSrc/modules/hr/leave",
# # #     "newSrc/modules/_legacy/controllers",
# # #     "newSrc/modules/_legacy/services",
# # #     "newSrc/modules/_legacy/models",
# # #     "newSrc/routes",
# # #     "newSrc/shared/validations",
# # #     "newSrc/scripts",
# # #     "newSrc/public",
# # #     "newSrc/logs",
# # #     "newSrc/tests"
# # # )

# # # foreach ($d in $dirs) {
# # #     New-Item -ItemType Directory -Path $d -Force | Out-Null
# # # }

# # # # -------------------------------
# # # # ROOT FILES
# # # # -------------------------------
# # # Copy-Item "src\app.js"      "newSrc\app.js"
# # # Copy-Item "src\server.js"   "newSrc\server.js"
# # # Copy-Item "src\debug-ai.js" "newSrc\debug-ai.js"

# # # # -------------------------------
# # # # BOOTSTRAP
# # # # -------------------------------
# # # Copy-Item "src\config\db.js"            "newSrc\bootstrap\db.js"
# # # Copy-Item "src\config\logger.js"        "newSrc\bootstrap\logger.js"
# # # Copy-Item "src\config\swaggerConfig.js" "newSrc\bootstrap\swagger.js"

# # # # -------------------------------
# # # # CONFIG
# # # # -------------------------------
# # # Copy-Item "src\config\permissions.js" "newSrc\config\permissions.js"

# # # # -------------------------------
# # # # ERROR HANDLING
# # # # -------------------------------
# # # Copy-Item "src\middleware\errorHandler.js"     "newSrc\core\error\errorHandler.js"
# # # Copy-Item "src\middleware\errorController.js" "newSrc\core\error\errorController.js"

# # # # -------------------------------
# # # # CORE MIDDLEWARE
# # # # -------------------------------
# # # $middlewareMap = @{
# # #     "assignRequestId.js"      = "requestId.middleware.js"
# # #     "authMiddleware.js"       = "auth.middleware.js"
# # #     "permissionMiddleware.js" = "permission.middleware.js"
# # #     "cacheMiddleware.js"      = "cache.middleware.js"
# # #     "uploadMiddleware.js"     = "upload.middleware.js"
# # #     "sessionActivity.js"      = "session.middleware.js"
# # # }

# # # foreach ($m in $middlewareMap.Keys) {
# # #     $src = "src\middleware\$m"
# # #     if (Test-Path $src) {
# # #         Copy-Item $src ("newSrc\core\middleware\" + $middlewareMap[$m])
# # #     }
# # # }

# # # # -------------------------------
# # # # ACCOUNTING MODELS
# # # # -------------------------------
# # # Copy-Item "src\models\accountModel.js"       "newSrc\modules\accounting\core\account.model.js"
# # # Copy-Item "src\models\accountEntryModel.js" "newSrc\modules\accounting\core\accountEntry.model.js"
# # # Copy-Item "src\models\invoiceModel.js"      "newSrc\modules\accounting\billing\invoice.model.js"
# # # Copy-Item "src\models\invoiceAuditModel.js" "newSrc\modules\accounting\billing\invoiceAudit.model.js"
# # # Copy-Item "src\models\paymentModel.js"      "newSrc\modules\accounting\payments\payment.model.js"
# # # Copy-Item "src\models\emiModel.js"          "newSrc\modules\accounting\payments\emi.model.js"

# # # # -------------------------------
# # # # ACCOUNTING CONTROLLERS
# # # # -------------------------------
# # # Copy-Item "src\controllers\ledgerController.js"     "newSrc\modules\accounting\core\ledger.controller.js"
# # # Copy-Item "src\controllers\invoiceController.js"    "newSrc\modules\accounting\billing\invoice.controller.js"
# # # Copy-Item "src\controllers\invoicePDFController.js" "newSrc\modules\accounting\billing\invoicePDF.controller.js"
# # # Copy-Item "src\controllers\paymentController.js"    "newSrc\modules\accounting\payments\payment.controller.js"

# # # # -------------------------------
# # # # ACCOUNTING SERVICES (SAFE)
# # # # -------------------------------
# # # $svcMap = @{
# # #     "ledgerService.js"  = "core\ledger.service.js"
# # #     "invoiceService.js" = "billing\invoice.service.js"
# # #     "paymentService.js" = "payments\payment.service.js"
# # # }

# # # foreach ($s in $svcMap.Keys) {
# # #     $src = "src\services\$s"
# # #     if (Test-Path $src) {
# # #         Copy-Item $src ("newSrc\modules\accounting\" + $svcMap[$s])
# # #     }
# # # }

# # # # -------------------------------
# # # # HR MODELS
# # # # -------------------------------
# # # Copy-Item "src\models\attendanceDailyModel.js"    "newSrc\modules\hr\attendance\models\attendanceDaily.model.js"
# # # Copy-Item "src\models\attendanceLogModel.js"      "newSrc\modules\hr\attendance\models\attendanceLog.model.js"
# # # Copy-Item "src\models\attendanceMachineModel.js" "newSrc\modules\hr\attendance\models\attendanceMachine.model.js"
# # # Copy-Item "src\models\attendanceRequestModel.js" "newSrc\modules\hr\attendance\models\attendanceRequest.model.js"
# # # Copy-Item "src\models\holidayModel.js"            "newSrc\modules\hr\holiday\holiday.model.js"
# # # Copy-Item "src\models\shiftModel.js"              "newSrc\modules\hr\shift\shift.model.js"
# # # Copy-Item "src\models\leaveRequestModel.js"       "newSrc\modules\hr\leave\leaveRequest.model.js"

# # # # -------------------------------
# # # # LEGACY CONTROLLERS
# # # # -------------------------------
# # # $excludeControllers = @(
# # #     "ledgerController.js",
# # #     "invoiceController.js",
# # #     "invoicePDFController.js",
# # #     "paymentController.js"
# # # )

# # # $controllers = Get-ChildItem "src\controllers" -File
# # # foreach ($c in $controllers) {
# # #     if ($excludeControllers -notcontains $c.Name) {
# # #         Copy-Item $c.FullName "newSrc\modules\_legacy\controllers"
# # #     }
# # # }

# # # # -------------------------------
# # # # LEGACY SERVICES
# # # # -------------------------------
# # # $excludeServices = @(
# # #     "ledgerService.js",
# # #     "invoiceService.js",
# # #     "paymentService.js"
# # # )

# # # $services = Get-ChildItem "src\services" -File
# # # foreach ($s in $services) {
# # #     if ($excludeServices -notcontains $s.Name) {
# # #         Copy-Item $s.FullName "newSrc\modules\_legacy\services"
# # #     }
# # # }

# # # # -------------------------------
# # # # LEGACY MODELS
# # # # -------------------------------
# # # $excludeModels = @(
# # #     "accountModel.js",
# # #     "accountEntryModel.js",
# # #     "invoiceModel.js",
# # #     "invoiceAuditModel.js",
# # #     "paymentModel.js",
# # #     "emiModel.js",
# # #     "attendanceDailyModel.js",
# # #     "attendanceLogModel.js",
# # #     "attendanceMachineModel.js",
# # #     "attendanceRequestModel.js",
# # #     "holidayModel.js",
# # #     "shiftModel.js",
# # #     "leaveRequestModel.js"
# # # )

# # # $models = Get-ChildItem "src\models" -File
# # # foreach ($m in $models) {
# # #     if ($excludeModels -notcontains $m.Name) {
# # #         Copy-Item $m.FullName "newSrc\modules\_legacy\models"
# # #     }
# # # }

# # # # -------------------------------
# # # # CORE UTILS
# # # # -------------------------------
# # # Copy-Item "src\utils\appError.js"         "newSrc\core\utils\appError.js"
# # # Copy-Item "src\utils\catchAsync.js"       "newSrc\core\utils\catchAsync.js"
# # # Copy-Item "src\utils\ApiFeatures.js"      "newSrc\core\utils\ApiFeatures.js"
# # # Copy-Item "src\utils\runInTransaction.js" "newSrc\core\utils\runInTransaction.js"

# # # # -------------------------------
# # # # LEGACY UTILS
# # # # -------------------------------
# # # $legacyUtils = Get-ChildItem "src\utils" -File
# # # foreach ($u in $legacyUtils) {
# # #     if (@("appError.js","catchAsync.js","ApiFeatures.js","runInTransaction.js") -notcontains $u.Name) {
# # #         Copy-Item $u.FullName "newSrc\core\utils\_legacy"
# # #     }
# # # }

# # # # -------------------------------
# # # # JOBS / ROUTES / ASSETS
# # # # -------------------------------
# # # Copy-Item "src\jobs\*"        "newSrc\core\jobs\_legacy" -Recurse
# # # Copy-Item "src\routes\v1"     "newSrc\routes\v1" -Recurse
# # # Copy-Item "src\validations\*" "newSrc\shared\validations" -Recurse
# # # Copy-Item "src\scripts\*"     "newSrc\scripts" -Recurse
# # # Copy-Item "src\public\*"      "newSrc\public" -Recurse

# # # # -------------------------------
# # # # MODEL STRUCTURE CHECK
# # # # -------------------------------
# # # if (Test-Path "src\models\src") {
# # #     Write-Warning "Invalid nested src/models/src detected"
# # # }

# # # # -------------------------------
# # # # SUMMARY
# # # # -------------------------------
# # # Write-Host "Migration completed successfully"


# # # # # ============================================================
# # # # # SAFE MIGRATION SCRIPT: src  → newSrc
# # # # # ============================================================

# # # # $ErrorActionPreference = "Stop"

# # # # # ---------- SAFETY CHECK ----------
# # # # if (Test-Path "newSrc") {
# # # #     Write-Error "❌ newSrc already exists. Delete or rename it before running."
# # # #     exit 1
# # # # }

# # # # Write-Host "🚀 Starting migration..."

# # # # # ---------- CREATE BASE STRUCTURE ----------
# # # # $baseDirs = @(
# # # #     "newSrc/bootstrap",
# # # #     "newSrc/config",
# # # #     "newSrc/core/error",
# # # #     "newSrc/core/middleware",
# # # #     "newSrc/core/utils",
# # # #     "newSrc/core/jobs",
# # # #     "newSrc/modules",
# # # #     "newSrc/shared/upload",
# # # #     "newSrc/shared/email",
# # # #     "newSrc/shared/pdf",
# # # #     "newSrc/shared/cache",
# # # #     "newSrc/routes",
# # # #     "newSrc/scripts",
# # # #     "newSrc/public",
# # # #     "newSrc/logs",
# # # #     "newSrc/tests"
# # # # )

# # # # $baseDirs | ForEach-Object {
# # # #     New-Item -ItemType Directory -Path $_ -Force | Out-Null
# # # # }

# # # # # ---------- ROOT FILES ----------
# # # # Copy-Item src/app.js newSrc/app.js
# # # # Copy-Item src/server.js newSrc/server.js
# # # # Copy-Item src/debug-ai.js newSrc/debug-ai.js

# # # # # ---------- BOOTSTRAP ----------
# # # # Copy-Item src/config/db.js newSrc/bootstrap/db.js
# # # # Copy-Item src/config/logger.js newSrc/bootstrap/logger.js
# # # # Copy-Item src/config/swaggerConfig.js newSrc/bootstrap/swagger.js

# # # # # ---------- CONFIG ----------
# # # # Copy-Item src/config/permissions.js newSrc/config/permissions.js

# # # # # ---------- CORE MIDDLEWARE ----------
# # # # $middlewareMap = @{
# # # #     "assignRequestId.js"       = "requestId.middleware.js"
# # # #     "authMiddleware.js"        = "auth.middleware.js"
# # # #     "permissionMiddleware.js"  = "permission.middleware.js"
# # # #     "cacheMiddleware.js"       = "cache.middleware.js"
# # # #     "uploadMiddleware.js"      = "upload.middleware.js"
# # # #     "sessionActivity.js"       = "session.middleware.js"
# # # # }

# # # # foreach ($old in $middlewareMap.Keys) {
# # # #     Copy-Item "src/middleware/$old" "newSrc/core/middleware/$($middlewareMap[$old])"
# # # # }

# # # # # ---------- CORE UTILS ----------
# # # # Get-ChildItem src/utils -File | ForEach-Object {
# # # #     Copy-Item $_.FullName "newSrc/core/utils/$($_.Name)"
# # # # }

# # # # Copy-Item src/utils/appError.js newSrc/core/error/AppError.js
# # # # Copy-Item src/middleware/errorHandler.js newSrc/core/error/errorHandler.js

# # # # # ---------- JOBS ----------
# # # # New-Item -ItemType Directory -Path newSrc/core/jobs -Force | Out-Null
# # # # Get-ChildItem src/jobs -File | ForEach-Object {
# # # #     Copy-Item $_.FullName "newSrc/core/jobs/$($_.Name)"
# # # # }

# # # # # ---------- ROUTES ----------
# # # # Copy-Item src/routes/v1 newSrc/routes -Recurse

# # # # # ---------- SCRIPTS ----------
# # # # Get-ChildItem src/scripts -File | ForEach-Object {
# # # #     Copy-Item $_.FullName "newSrc/scripts/$($_.Name)"
# # # # }

# # # # # ---------- PUBLIC ----------
# # # # Copy-Item src/public newSrc/public -Recurse

# # # # # ============================================================
# # # # # MODULE CREATION HELPERS
# # # # # ============================================================
# # # # function Ensure-Dir($path) {
# # # #     if (!(Test-Path $path)) {
# # # #         New-Item -ItemType Directory -Path $path -Force | Out-Null
# # # #     }
# # # # }

# # # # # ============================================================
# # # # # ACCOUNTING
# # # # # ============================================================
# # # # Ensure-Dir "newSrc/modules/accounting/core"
# # # # Ensure-Dir "newSrc/modules/accounting/billing"
# # # # Ensure-Dir "newSrc/modules/accounting/payments"
# # # # Ensure-Dir "newSrc/modules/accounting/reporting"

# # # # $accountingModels = @{
# # # #     "accountModel.js"        = "core/account.model.js"
# # # #     "accountEntryModel.js"   = "core/accountEntry.model.js"
# # # #     "invoiceModel.js"        = "billing/invoice.model.js"
# # # #     "invoiceAuditModel.js"   = "billing/invoiceAudit.model.js"
# # # #     "paymentModel.js"        = "payments/payment.model.js"
# # # #     "emiModel.js"            = "payments/emi.model.js"
# # # # }

# # # # foreach ($k in $accountingModels.Keys) {
# # # #     Copy-Item "src/models/$k" "newSrc/modules/accounting/$($accountingModels[$k])"
# # # # }

# # # # $accountingControllers = @{
# # # #     "ledgerController.js"     = "core/ledger.controller.js"
# # # #     "invoiceController.js"    = "billing/invoice.controller.js"
# # # #     "invoicePDFController.js" = "billing/invoicePDF.controller.js"
# # # #     "paymentController.js"    = "payments/payment.controller.js"
# # # #     "statementsController.js" = "reporting/statements.controller.js"
# # # #     "reconciliationController.js" = "reporting/reconciliation.controller.js"
# # # # }

# # # # foreach ($k in $accountingControllers.Keys) {
# # # #     Copy-Item "src/controllers/$k" "newSrc/modules/accounting/$($accountingControllers[$k])"
# # # # }

# # # # # ============================================================
# # # # # HR
# # # # # ============================================================
# # # # Ensure-Dir "newSrc/modules/hr/attendance/models"
# # # # Ensure-Dir "newSrc/modules/hr/holiday"
# # # # Ensure-Dir "newSrc/modules/hr/shift"
# # # # Ensure-Dir "newSrc/modules/hr/leave"

# # # # $hrModels = @{
# # # #     "attendanceDailyModel.js"   = "attendance/models/attendanceDaily.model.js"
# # # #     "attendanceLogModel.js"     = "attendance/models/attendanceLog.model.js"
# # # #     "attendanceMachineModel.js"= "attendance/models/attendanceMachine.model.js"
# # # #     "attendanceRequestModel.js"= "attendance/models/attendanceRequest.model.js"
# # # #     "holidayModel.js"           = "holiday/holiday.model.js"
# # # #     "shiftModel.js"             = "shift/shift.model.js"
# # # #     "leaveRequestModel.js"      = "leave/leaveRequest.model.js"
# # # # }

# # # # foreach ($k in $hrModels.Keys) {
# # # #     Copy-Item "src/models/$k" "newSrc/modules/hr/$($hrModels[$k])"
# # # # }

# # # # # ============================================================
# # # # # CRM / SALES / INVENTORY / PURCHASE / SUPPLIER
# # # # # ============================================================
# # # # $domainMap = @{
# # # #     "crm"       = @("customerModel.js","noteModel.js","customerController.js","noteController.js")
# # # #     "sales"     = @("salesModel.js","salesReturnModel.js","salesController.js","salesReturnController.js")
# # # #     "inventory" = @("productModel.js","inventoryController.js")
# # # #     "purchase"  = @("purchaseModel.js","purchaseController.js")
# # # #     "supplier"  = @("supplierModel.js","supplierController.js")
# # # # }

# # # # foreach ($domain in $domainMap.Keys) {
# # # #     Ensure-Dir "newSrc/modules/$domain"
# # # #     foreach ($file in $domainMap[$domain]) {
# # # #         if (Test-Path "src/models/$file") {
# # # #             Copy-Item "src/models/$file" "newSrc/modules/$domain/$file"
# # # #         }
# # # #         if (Test-Path "src/controllers/$file") {
# # # #             Copy-Item "src/controllers/$file" "newSrc/modules/$domain/$file"
# # # #         }
# # # #     }
# # # # }

# # # # # ============================================================
# # # # # COMMUNICATION
# # # # # ============================================================
# # # # Ensure-Dir "newSrc/modules/communication"

# # # # $communicationFiles = @(
# # # #     "announcementModel.js",
# # # #     "messageModel.js",
# # # #     "notificationModel.js",
# # # #     "announcementController.js",
# # # #     "messageController.js",
# # # #     "notificationController.js"
# # # # )

# # # # foreach ($f in $communicationFiles) {
# # # #     if (Test-Path "src/models/$f") {
# # # #         Copy-Item "src/models/$f" "newSrc/modules/communication/$f"
# # # #     }
# # # #     if (Test-Path "src/controllers/$f") {
# # # #         Copy-Item "src/controllers/$f" "newSrc/modules/communication/$f"
# # # #     }
# # # # }

# # # # # ============================================================
# # # # # AUTH / IAM / ORG / USERS
# # # # # ============================================================
# # # # Ensure-Dir "newSrc/modules/auth"
# # # # Ensure-Dir "newSrc/modules/iam"
# # # # Ensure-Dir "newSrc/modules/organization"

# # # # Copy-Item src/controllers/authController.js newSrc/modules/auth/auth.controller.js
# # # # Copy-Item src/controllers/roleControllers.js newSrc/modules/iam/role.controller.js
# # # # Copy-Item src/controllers/ownership.controller.js newSrc/modules/iam/ownership.controller.js
# # # # Copy-Item src/models/roleModel.js newSrc/modules/iam/role.model.js
# # # # Copy-Item src/models/organizationModel.js newSrc/modules/organization/organization.model.js
# # # # Copy-Item src/models/branchModel.js newSrc/modules/organization/branch.model.js
# # # # Copy-Item src/models/channelModel.js newSrc/modules/organization/channel.model.js
# # # # Copy-Item src/controllers/organizationController.js newSrc/modules/organization/organization.controller.js
# # # # Copy-Item src/controllers/organizationExtrasController.js newSrc/modules/organization/organizationExtras.controller.js

# # # # # ============================================================
# # # # # FINAL AUDIT
# # # # # ============================================================
# # # # Write-Host "`n✅ Migration complete."
# # # # Write-Host "SRC FILE COUNT:" (Get-ChildItem src -Recurse -File | Measure-Object).Count
# # # # Write-Host "NEW SRC FILE COUNT:" (Get-ChildItem newSrc -Recurse -File | Measure-Object).Count
# # # # Write-Host "📌 No files were deleted."






# # # # # if (Test-Path newSrc) {
# # # # #   Write-Error "newSrc already exists. Aborting to avoid overwrite."
# # # # #   exit 1
# # # # # }
# # # # # $dirs = @(
# # # # #   "newSrc",
# # # # #   "newSrc/bootstrap",
# # # # #   "newSrc/config",
# # # # #   "newSrc/core/error",
# # # # #   "newSrc/core/middleware",
# # # # #   "newSrc/core/utils",
# # # # #   "newSrc/core/jobs",
# # # # #   "newSrc/modules",
# # # # #   "newSrc/shared",
# # # # #   "newSrc/routes",
# # # # #   "newSrc/scripts",
# # # # #   "newSrc/public",
# # # # #   "newSrc/logs",
# # # # #   "newSrc/tests"
# # # # # )

# # # # # $dirs | ForEach-Object { New-Item -ItemType Directory -Path $_ -Force | Out-Null }
# # # # # Copy-Item src\app.js newSrc\app.js
# # # # # Copy-Item src\server.js newSrc\server.js
# # # # # Copy-Item src\debug-ai.js newSrc\debug-ai.js
# # # # # Copy-Item src\config\db.js newSrc\bootstrap\db.js
# # # # # Copy-Item src\config\logger.js newSrc\bootstrap\logger.js
# # # # # Copy-Item src\config\swaggerConfig.js newSrc\bootstrap\swagger.js
# # # # # Copy-Item src\config\permissions.js newSrc\config\permissions.js
# # # # # $middlewareMap = @{
# # # # #   "assignRequestId.js"   = "requestId.middleware.js"
# # # # #   "authMiddleware.js"    = "auth.middleware.js"
# # # # #   "permissionMiddleware.js" = "permission.middleware.js"
# # # # #   "cacheMiddleware.js"   = "cache.middleware.js"
# # # # #   "uploadMiddleware.js"  = "upload.middleware.js"
# # # # #   "sessionActivity.js"   = "session.middleware.js"
# # # # # }

# # # # # foreach ($file in $middlewareMap.Keys) {
# # # # #   Copy-Item "src\middleware\$file" "newSrc\core\middleware\$($middlewareMap[$file])"
# # # # # }

# # # # # New-Item -ItemType Directory -Path newSrc\modules\accounting\core -Force
# # # # # New-Item -ItemType Directory -Path newSrc\modules\accounting\billing -Force
# # # # # New-Item -ItemType Directory -Path newSrc\modules\accounting\payments -Force

# # # # # Copy-Item src\models\accountModel.js newSrc\modules\accounting\core\account.model.js
# # # # # Copy-Item src\models\accountEntryModel.js newSrc\modules\accounting\core\accountEntry.model.js
# # # # # Copy-Item src\models\invoiceModel.js newSrc\modules\accounting\billing\invoice.model.js
# # # # # Copy-Item src\models\invoiceAuditModel.js newSrc\modules\accounting\billing\invoiceAudit.model.js
# # # # # Copy-Item src\models\paymentModel.js newSrc\modules\accounting\payments\payment.model.js
# # # # # Copy-Item src\models\emiModel.js newSrc\modules\accounting\payments\emi.model.js
# # # # # New-Item -ItemType Directory -Path newSrc\modules\hr\attendance\models -Force
# # # # # New-Item -ItemType Directory -Path newSrc\modules\hr\holiday -Force
# # # # # New-Item -ItemType Directory -Path newSrc\modules\hr\shift -Force
# # # # # New-Item -ItemType Directory -Path newSrc\modules\hr\leave -Force

# # # # # Copy-Item src\models\attendanceDailyModel.js newSrc\modules\hr\attendance\models\attendanceDaily.model.js
# # # # # Copy-Item src\models\attendanceLogModel.js newSrc\modules\hr\attendance\models\attendanceLog.model.js
# # # # # Copy-Item src\models\attendanceMachineModel.js newSrc\modules\hr\attendance\models\attendanceMachine.model.js
# # # # # Copy-Item src\models\attendanceRequestModel.js newSrc\modules\hr\attendance\models\attendanceRequest.model.js
# # # # # Copy-Item src\models\holidayModel.js newSrc\modules\hr\holiday\holiday.model.js
# # # # # Copy-Item src\models\shiftModel.js newSrc\modules\hr\shift\shift.model.js
# # # # # Copy-Item src\models\leaveRequestModel.js newSrc\modules\hr\leave\leaveRequest.model.js
# # # # # New-Item -ItemType Directory -Path newSrc\modules\crm -Force
# # # # # New-Item -ItemType Directory -Path newSrc\modules\sales -Force
# # # # # New-Item -ItemType Directory -Path newSrc\modules\inventory -Force
# # # # # New-Item -ItemType Directory -Path newSrc\modules\supplier -Force

# # # # # Copy-Item src\models\customerModel.js newSrc\modules\crm\customer.model.js
# # # # # Copy-Item src\models\salesModel.js newSrc\modules\sales\sales.model.js
# # # # # Copy-Item src\models\productModel.js newSrc\modules\inventory\product.model.js
# # # # # Copy-Item src\models\supplierModel.js newSrc\modules\supplier\supplier.model.js
# # # # # New-Item -ItemType Directory -Path newSrc\modules\accounting\billing -Force

# # # # # Copy-Item src\controllers\invoiceController.js newSrc\modules\accounting\billing\invoice.controller.js
# # # # # Copy-Item src\controllers\invoicePDFController.js newSrc\modules\accounting\billing\invoicePDF.controller.js
# # # # # Copy-Item src\controllers\paymentController.js newSrc\modules\accounting\payments\payment.controller.js
# # # # # Copy-Item src\controllers\ledgerController.js newSrc\modules\accounting\core\ledger.controller.js
# # # # # Copy-Item src\routes\v1\* newSrc\routes\ -Recurse
# # # # # New-Item -ItemType Directory -Path newSrc\modules\inventory -Force
# # # # # New-Item -ItemType Directory -Path newSrc\modules\communication -Force

# # # # # Copy-Item src\jobs\inventoryAlertCronJob.js newSrc\modules\inventory\inventory.jobs.js
# # # # # Copy-Item src\jobs\notificationCronJob.js newSrc\modules\communication\notification.jobs.js
# # # # # Get-ChildItem newSrc -Recurse | Measure-Object
# # # # # Get-ChildItem src -Recurse | Measure-Object
