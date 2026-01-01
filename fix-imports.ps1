# # ======================================================
# # APEX CRM - IMPORT FIXER SCRIPT
# # Fixes imports after modular migration
# # ======================================================

# $ErrorActionPreference = "Stop"

# # Color functions
# function Write-Info { Write-Host "[INFO] $args" -ForegroundColor Cyan }
# function Write-Success { Write-Host "[SUCCESS] $args" -ForegroundColor Green }
# function Write-Warning { Write-Host "[WARNING] $args" -ForegroundColor Yellow }
# function Write-Error { Write-Host "[ERROR] $args" -ForegroundColor Red }
# function Write-Detail { Write-Host "  $args" -ForegroundColor Gray }

# Write-Info "Starting Import Fixing Process..."

# # Import mapping dictionaries
# $modelImports = @{
#     "require.*models/accountModel" = "require('../../modules/accounting/core/account.model')"
#     "require.*models/accountEntryModel" = "require('../../modules/accounting/core/accountEntry.model')"
#     "require.*models/invoiceModel" = "require('../../modules/accounting/billing/invoice.model')"
#     "require.*models/paymentModel" = "require('../../modules/accounting/payments/payment.model')"
#     "require.*models/userModel" = "require('../../modules/auth/users/user.model')"
#     "require.*models/roleModel" = "require('../../modules/auth/roles/role.model')"
#     "require.*models/productModel" = "require('../../modules/inventory/products/product.model')"
#     "require.*models/customerModel" = "require('../../modules/organization/customers/customer.model')"
#     "require.*models/branchModel" = "require('../../modules/organization/branches/branch.model')"
#     # Add all your model mappings here
# }

# $controllerImports = @{
#     "require.*controllers/accountController" = "require('../../modules/accounting/core/account.controller')"
#     "require.*controllers/authController" = "require('../../modules/auth/core/auth.controller')"
#     "require.*controllers/userController" = "require('../../modules/auth/users/user.controller')"
#     "require.*controllers/inventoryController" = "require('../../modules/inventory/core/inventory.controller')"
#     # Add all your controller mappings here
# }

# $utilImports = @{
#     "require.*utils/catchAsync" = "require('../core/utils/catchAsync')"
#     "require.*utils/appError" = "require('../core/utils/appError')"
#     "require.*utils/handlerFactory" = "require('../core/utils/handlerFactory')"
#     "require.*utils/handleFactorynew" = "require('../core/utils/handleFactorynew')"
#     "require.*utils/newApiFeatures" = "require('../core/utils/newApiFeatures')"
#     # Add all util mappings here
# }

# $middlewareImports = @{
#     "require.*middleware/authMiddleware" = "require('../core/middleware/auth.middleware')"
#     "require.*middleware/errorHandler" = "require('../core/error/errorHandler')"
#     # Add all middleware mappings here
# }

# # Function to fix imports in a file
# function Fix-FileImports {
#     param(
#         [string]$filePath
#     )
    
#     $content = Get-Content $filePath -Raw
#     $originalContent = $content
    
#     # Apply all import replacements
#     $allMappings = @{}
#     $modelImports.GetEnumerator() | ForEach-Object { $allMappings[$_.Key] = $_.Value }
#     $controllerImports.GetEnumerator() | ForEach-Object { $allMappings[$_.Key] = $_.Value }
#     $utilImports.GetEnumerator() | ForEach-Object { $allMappings[$_.Key] = $_.Value }
#     $middlewareImports.GetEnumerator() | ForEach-Object { $allMappings[$_.Key] = $_.Value }
    
#     foreach ($mapping in $allMappings.GetEnumerator()) {
#         $pattern = $mapping.Key
#         $replacement = $mapping.Value
        
#         # Handle both single and double quotes
#         $pattern1 = $pattern.replace("'", "['\"]")
#         $pattern2 = $pattern.replace('"', '[\'"]')
        
#         $content = $content -replace $pattern1, $replacement
#         $content = $content -replace $pattern2, $replacement
#     }
    
#     # Also handle relative paths
#     $content = $content -replace '\.\./models/', '../../modules/'  # This is a simple example
    
#     if ($content -ne $originalContent) {
#         Set-Content -Path $filePath -Value $content -Encoding UTF8
#         return $true
#     }
    
#     return $false
# }

# # Main fixing process
# $filesFixed = 0
# $totalFiles = 0

# # Get all JS files in newSrc
# $jsFiles = Get-ChildItem -Path "newSrc" -Recurse -Filter "*.js"

# foreach ($file in $jsFiles) {
#     $totalFiles++
#     if (Fix-FileImports -filePath $file.FullName) {
#         $filesFixed++
#         Write-Detail "Fixed: $($file.FullName)"
#     }
# }

# Write-Success "Import fixing complete!"
# Write-Host ""
# Write-Host "========================================" -ForegroundColor Green
# Write-Host "SUMMARY" -ForegroundColor Green
# Write-Host "========================================" -ForegroundColor Green
# Write-Host "Files processed: $totalFiles" -ForegroundColor Cyan
# Write-Host "Files modified: $filesFixed" -ForegroundColor Cyan
# Write-Host ""
# Write-Host "Next steps:" -ForegroundColor Yellow
# Write-Host "1. Run the script again after adding more mapping rules" -ForegroundColor Gray
# Write-Host "2. Manually check complex imports" -ForegroundColor Gray
# Write-Host "3. Use ESLint to find remaining import issues" -ForegroundColor Gray