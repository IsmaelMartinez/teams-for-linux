const { Notification, app } = require('electron');

/**
 * @typedef {Object} ReminderNotification
 * @property {string} subject
 * @property {string} [location]
 * @property {string} timeUntil
 * @property {string} [startTime]
 * @property {string} [reminderType]
 */

/**
 * @typedef {Object} EmailNotification
 * @property {string} address
 * @property {string} subject
 */

let reminders = [];
let emails = [];
let reminderNotificationHandle = null;
let emailNotificationHandle = null;
let mainWindow = null;
let iconPath = null;
let menusInstance = null;

// Badge count tracking
let currentEmailCount = 0;
let currentReminderCount = 0;
let alternatingInterval = null;

/**
 * Initialize the notification module
 * @param {BrowserWindow} window - The main application window
 * @param {string} icon - Path to the notification icon
 * @param {object} menus - The Menus instance for updating tray badge
 */
function init(window, icon, menus) {
	mainWindow = window;
	iconPath = icon;
	menusInstance = menus;
	console.info('[Notification Module] Initialized');
}

/**
 * Update badge based on Outlook's unread count
 * @param {number} count - Unread email count from Outlook
 */
function updateBadgeFromUnreadCount(count) {
	console.debug('[Notification Module] updateBadgeFromUnreadCount:', count);
	currentEmailCount = count;
	updateAlternatingBadge();
}

/**
 * Update badge based on active reminder count
 * @param {number} count - Active reminder count
 */
function updateBadgeFromReminderCount(count) {
	console.debug('[Notification Module] updateBadgeFromReminderCount:', count);
	currentReminderCount = count;
	updateAlternatingBadge();
}

/**
 * Update badge with alternating logic
 */
function updateAlternatingBadge() {
	// Stop any existing alternating interval
	if (alternatingInterval) {
		clearInterval(alternatingInterval);
		alternatingInterval = null;
	}

	// If both counts exist, alternate between them
	if (currentEmailCount > 0 && currentReminderCount > 0) {
		let showEmail = true;

		// Initial display
		updateTrayBadge(showEmail ? currentEmailCount : currentReminderCount, showEmail ? 'email' : 'reminder');

		// Alternate every 3 seconds
		alternatingInterval = setInterval(() => {
			showEmail = !showEmail;
			updateTrayBadge(showEmail ? currentEmailCount : currentReminderCount, showEmail ? 'email' : 'reminder');
		}, 3000);
	}
	// Only emails
	else if (currentEmailCount > 0) {
		updateTrayBadge(currentEmailCount, 'email');
	}
	// Only reminders
	else if (currentReminderCount > 0) {
		updateTrayBadge(currentReminderCount, 'reminder');
	}
	// No badges
	else {
		updateTrayBadge(0, 'email');
	}
}

/**
 * Update tray badge with count and type
 * @param {number} count
 * @param {string} type - 'email' or 'reminder'
 */
function updateTrayBadge(count, type) {
	app.setBadgeCount(count);
	if (menusInstance) {
		menusInstance.updateTrayBadge(count, type);
	}
}

/**
 * Reset current email and reminder notifications
 */
function reset() {
	reminders = [];
	emails = [];
	if (reminderNotificationHandle) {
		reminderNotificationHandle.close();
		reminderNotificationHandle = null;
	}
	if (emailNotificationHandle) {
		emailNotificationHandle.close();
		emailNotificationHandle = null;
	}
}

/**
 * Create a notification with click and close handlers
 * @param {string} title
 * @param {string} body
 * @param {Function} onClose
 * @returns {Electron.Notification}
 */
function createNotification(title, body, onClose) {
	const notification = new Notification({
		title,
		body,
		icon: iconPath,
		urgency: 'normal',
	});

	notification.on('click', () => {
		if (mainWindow) {
			mainWindow.show();
			mainWindow.focus();
		}
	});

	notification.on('close', onClose);

	return notification;
}

/**
 * Show reminder notification for all current reminders
 * @param {ReminderNotification} notification
 */
function showReminderNotification(notification) {
	if (!notification) return;

	// Check if same notification already exists
	if (!reminders.find(r => r.subject === notification.subject && r.timeUntil === notification.timeUntil)) {
		reminders.push(notification);
	}

	let title;
	let body;

	if (reminders.length === 1) {
		const r = reminders[0];
		title = `${r.reminderType || 'Reminder'}: ${r.subject}`;

		const details = [];
		if (r.timeUntil) details.push(`Time: ${r.timeUntil}`);
		if (r.startTime) details.push(`Start: ${r.startTime}`);
		if (r.location) details.push(`Location: ${r.location}`);

		body = details.join('\n');
	} else {
		title = `${reminders.length} New Reminders`;
		body = reminders.map(r => {
			let line = `\u2022 ${r.subject}`;
			if (r.timeUntil) line += ` (${r.timeUntil})`;
			return line;
		}).join('\n');
	}

	if (reminderNotificationHandle) {
		reminderNotificationHandle.close();
	}

	reminderNotificationHandle = createNotification(title, body, () => {
		reminders = [];
		reminderNotificationHandle = null;
	});

	reminderNotificationHandle.show();
}

/**
 * Show email notification for all current emails
 * @param {EmailNotification} notification
 */
function showEmailNotification(notification) {
	if (!notification) return;

	// Check if same notification already exists
	if (!emails.find(e => e.address === notification.address && e.subject === notification.subject)) {
		emails.push(notification);
	}

	let title;
	let body;

	if (emails.length === 1) {
		title = 'New Email';
		body = `From: ${emails[0].address}\nSubject: ${emails[0].subject}\n\nMessage: ${emails[0].body}`;
	} else {
		const senderNames = [...new Set(emails.map(e => e.address))];

		if (senderNames.length === 1) {
			title = `${emails.length} new emails from ${senderNames[0]}`;
			body = emails.map(e => `\u2022 Subject: ${e.subject}`).join('\n');
		} else {
			title = `${emails.length} New Emails`;
			body = emails.map(e => `${e.address}\n\u2022 Subject: ${e.subject}`).join('\n\n');
		}
	}

	if (emailNotificationHandle) {
		emailNotificationHandle.close();
	}

	emailNotificationHandle = createNotification(title, body, () => {
		emailNotificationHandle = null;
		emails = [];
	});

	emailNotificationHandle.show();
}

module.exports = {
	init,
	reset,
	showReminderNotification,
	showEmailNotification,
	updateBadgeFromUnreadCount,
	updateBadgeFromReminderCount
};
