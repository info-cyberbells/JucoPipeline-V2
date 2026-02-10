import Notification from "../models/notification.model.js";
import AdminNotificationSetting from "../models/adminNotificationSetting.model.js";

const TYPE_TO_TRIGGER_MAP = {
  PLAYER_REGISTRATION: "playerRegistration",
  PLAYER_LOGIN_CLAIM: "playerProfileClaim",
  VIDEO_REQUEST: "requestMoreVideo",
  USER_REGISTRATION: null
};

export const createAdminNotification = async ({
  title,
  message,
  type,
  referenceId = null,
  createdBy = null,
  meta = {}
}) => {
  try {
    const settings = await AdminNotificationSetting.findOne({
      adminRole: "superAdmin"
    });

    // If settings exist → check toggle
    if (settings) {
      // Handle coach/scout registration separately
      if (type === "USER_REGISTRATION") {
        if (meta.role === "coach" && !settings.triggers.coachRegistration) return;

        if (meta.role === "scout" && !settings.triggers.scoutRegistration) return;
      }
      // Handle mapped triggers
      else {
        const triggerKey = TYPE_TO_TRIGGER_MAP[type];
        if (triggerKey && !settings.triggers[triggerKey]) {
          return; // Notification disabled
        }
      }
    }

    // Create notification
    // await Notification.create({
    //   recipientRole: "superAdmin",
    //   title,
    //   message,
    //   type,
    //   referenceId,
    //   createdBy,
    //   meta
    // });

    // Check for duplicate unread notification
    const existingNotification = await Notification.findOne({
      recipientRole: "superAdmin",
      type,
      referenceId,
      isRead: false
    });

    if (existingNotification) {
      // Duplicate already exists → do not create again
      return;
    }

    // Create notification
    await Notification.create({
      recipientRole: "superAdmin",
      title,
      message,
      type,
      referenceId,
      createdBy,
      meta
    });

  } catch (error) {
    console.error("Admin Notification Error:", error);
  }
};

