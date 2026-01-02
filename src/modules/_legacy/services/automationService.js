const axios = require('axios'); // Ensure axios is installed: npm install axios
const crypto = require('crypto');
const { Webhook, Workflow } = require('../models/automationModel');
const { createNotification } = require('../../notification/core/notification.service');
const sendEmail = require('../../../core/utils/_legacy/email'); // Assuming existing email util

/* -------------------------------------------------------------
 * TRIGGER: The Main Entry Point
 * Call this from any controller: triggerEvent('invoice.created', invoiceDoc)
 ------------------------------------------------------------- */
exports.triggerEvent = async (eventName, payload, orgId) => {
    // Run asynchronously (Fire & Forget) so we don't block the API response
    processEvent(eventName, payload, orgId).catch(err => 
        console.error(`❌ Automation Error [${eventName}]:`, err.message)
    );
};

async function processEvent(eventName, payload, orgId) {
    console.log(`⚡ Event Triggered: ${eventName} for Org ${orgId}`);

    // 1. EXECUTE WORKFLOWS (Internal Rules)
    const workflows = await Workflow.find({ organizationId: orgId, triggerEvent: eventName, isActive: true });
    
    for (const flow of workflows) {
        if (evaluateConditions(flow.conditions, payload)) {
            await executeActions(flow.actions, payload);
        }
    }

    // 2. FIRE WEBHOOKS (External Integrations)
    const webhooks = await Webhook.find({ organizationId: orgId, events: eventName, isActive: true });
    
    for (const hook of webhooks) {
        await sendWebhook(hook, eventName, payload);
    }
}

/* -------------------------------------------------------------
 * LOGIC ENGINE: Evaluates "If X > Y"
 ------------------------------------------------------------- */
function evaluateConditions(conditions, data) {
    if (!conditions || conditions.length === 0) return true; // No conditions = Always run

    return conditions.every(cond => {
        const dataValue = getNestedValue(data, cond.field); // Handle "customer.name"
        const ruleValue = cond.value;

        switch (cond.operator) {
            case 'eq': return dataValue == ruleValue;
            case 'neq': return dataValue != ruleValue;
            case 'gt': return Number(dataValue) > Number(ruleValue);
            case 'lt': return Number(dataValue) < Number(ruleValue);
            case 'contains': return String(dataValue).includes(String(ruleValue));
            default: return false;
        }
    });
}

/* -------------------------------------------------------------
 * ACTION EXECUTOR
 ------------------------------------------------------------- */
async function executeActions(actions, payload) {
    for (const action of actions) {
        // Hydrate template variables: "Hello {customerName}" -> "Hello John"
        const message = action.template.replace(/\{(\w+)\}/g, (_, k) => payload[k] || '');

        if (action.type === 'email') {
            await sendEmail({ email: action.target, subject: 'Automated Alert', message });
        } else if (action.type === 'notification') {
            // Send internal system notification
            // Assuming createNotification takes (userId, title, message)
            // You might need logic to find User ID by Role if target is 'admin'
        }
    }
}

/* -------------------------------------------------------------
 * WEBHOOK SENDER (Secure)
 ------------------------------------------------------------- */
async function sendWebhook(hook, event, payload) {
    try {
        const body = { event, timestamp: new Date(), data: payload };
        
        // Security: Sign payload with HMAC
        const signature = crypto
            .createHmac('sha256', hook.secret || 'default-secret')
            .update(JSON.stringify(body))
            .digest('hex');

        await axios.post(hook.url, body, {
            headers: { 'X-Apex-Signature': signature },
            timeout: 5000
        });
    } catch (err) {
        console.error(`Webhook Failed (${hook.url}):`, err.message);
        // Optional: Increment failure count and disable if > 10 failures
    }
}

// Helper: Access nested objects (e.g. "items.0.price")
function getNestedValue(obj, path) {
    return path.split('.').reduce((acc, part) => acc && acc[part], obj);
}