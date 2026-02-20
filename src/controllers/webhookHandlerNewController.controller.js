import stripe from "../config/stripe.js";
import outseta from "../config/outseta.config.js";
import User from "../models/user.model.js";
import PendingRegistration from "../models/pendingRegistration.model.js";
import Subscription from "../models/subscription.model.js";
import { createAdminNotification } from "../utils/adminNotification.js";
import { webhookLogger } from '../utils/logger.js';
import mongoose from "mongoose";

// ============================================
// OUTSETA WEBHOOK HANDLER
// ============================================
export const handleOutsetaWebhookOLDDDD = async (req, res) => {
  try {
    const payload = req.body;
    console.log("Outseta Webhook Received");
    console.log("Account UID:", payload.Uid);
    console.log("Email:", payload.PrimaryContact?.Email);

    if (payload.CurrentSubscription) {
      await handleOutsetaSubscriptionCreated(payload);
    }

    if (payload.Subscriptions && payload.Subscriptions.length === 0 && payload.AccountStageLabel === "Cancelled") {
      await handleOutsetaSubscriptionCancelled(payload);
    }

    res.status(200).json({ success: true });
  } catch (err) {
    console.error("❌ Outseta webhook error:", err);
    res.status(500).json({ err: "Webhook failed" });
  }
};

export const handleOutsetaWebhookCONSOLE = async (req, res) => {
  try {
    const payload = req.body;
    const accountUid = payload.Uid;
    const email = payload.PrimaryContact?.Email;
    const stageLabel = payload.AccountStageLabel;
    const accountStage = payload.AccountStage;

    console.log("==============================");
    console.log("Outseta Webhook Received");
    console.log("Account UID:", accountUid);
    console.log("Email:", email);
    console.log("Stage:", accountStage, "→", stageLabel);
    console.log("==============================");

    webhookLogger.info("Outseta Webhook Received", {
      accountUid,
      email,
      stage: `${accountStage} → ${stageLabel}`,
    });

    // PAYMENT EVENTS (check first)
    if (payload.StripeInvoices?.length > 0) {
      const latestInvoice = payload.StripeInvoices[0];
      if (latestInvoice.Status === "paid") {
        await handleOutsetaPaymentSucceeded(payload);
        return res.status(200).json({ success: true, event: "payment_succeeded" });
      }
      if (latestInvoice.Status === "failed" || latestInvoice.Status === "uncollectible") {
        await handleOutsetaPaymentFailed(payload);
        return res.status(200).json({ success: true, event: "payment_failed" });
      }
    }

    // CANCELLATION CHECKS FIRST (before CurrentSubscription block)
    // because CurrentSubscription is still present during cancelling stage
    if (accountStage === 4 || stageLabel === "Cancelling") {
      console.log("⏳ Routing to → handleOutsetaSubscriptionCancelling");
      await handleOutsetaSubscriptionCancelling(payload);
      return res.status(200).json({ success: true, event: "subscription_cancelling" });
    }

    if (accountStage === 5 || stageLabel === "Cancelled") {
      console.log("❌ Routing to → handleOutsetaSubscriptionCancelled");
      await handleOutsetaSubscriptionCancelled(payload);
      return res.status(200).json({ success: true, event: "subscription_cancelled" });
    }

    // NEW SIGNUP vs EXISTING USER UPDATE
    if (payload.CurrentSubscription) {
      const existingUser = await User.findOne({
        $or: [{ outsetaAccountUid: accountUid }, { email }]
      });

      if (!existingUser) {
        console.log("🆕 New user → routing to handleOutsetaSubscriptionCreated");
        await handleOutsetaSubscriptionCreated(payload);
        return res.status(200).json({ success: true, event: "subscription_created" });
      } else {
        console.log("🔄 Existing user → routing to handleOutsetaSubscriptionUpdated");
        await handleOutsetaSubscriptionUpdated(payload);
        return res.status(200).json({ success: true, event: "subscription_updated" });
      }
    }

    console.log("⚠️ Unhandled Outseta webhook. Stage:", accountStage, stageLabel);
    return res.status(200).json({ success: true, event: "unhandled" });

  } catch (err) {
    console.error("❌ Outseta webhook error:", err);
    res.status(500).json({ error: "Webhook failed" });
  }
};

export const handleOutsetaWebhook = async (req, res) => {
  try {
    const payload = req.body;
    const accountUid = payload.Uid;
    const email = payload.PrimaryContact?.Email;
    const stageLabel = payload.AccountStageLabel;
    const accountStage = payload.AccountStage;

    console.log("==============================");
    console.log("Outseta Webhook Received");
    console.log("Account UID:", accountUid);
    console.log("Email:", email);
    console.log("Stage:", accountStage, "→", stageLabel);
    console.log("==============================");

    webhookLogger.info("Outseta Webhook Received", {
      accountUid,
      email,
      stage: `${accountStage} → ${stageLabel}`,
    });

    // PAYMENT EVENTS
    if (payload.StripeInvoices?.length > 0) {
      const latestInvoice = payload.StripeInvoices[0];

      if (latestInvoice.Status === "paid") {
        webhookLogger.info("Routing to → handleOutsetaPaymentSucceeded", { accountUid, email });
        await handleOutsetaPaymentSucceeded(payload);
        return res.status(200).json({ success: true, event: "payment_succeeded" });
      }

      if (latestInvoice.Status === "failed" || latestInvoice.Status === "uncollectible") {
        webhookLogger.warn("Routing to → handleOutsetaPaymentFailed", { accountUid, email, status: latestInvoice.Status });
        await handleOutsetaPaymentFailed(payload);
        return res.status(200).json({ success: true, event: "payment_failed" });
      }
    }

    // CANCELLATION CHECKS
    if (accountStage === 4 || stageLabel === "Cancelling") {
      webhookLogger.warn("Routing to → handleOutsetaSubscriptionCancelling", { accountUid, email, accountStage });
      await handleOutsetaSubscriptionCancelling(payload);
      return res.status(200).json({ success: true, event: "subscription_cancelling" });
    }

    if (accountStage === 5 || stageLabel === "Cancelled") {
      webhookLogger.warn("Routing to → handleOutsetaSubscriptionCancelled", { accountUid, email, accountStage });
      await handleOutsetaSubscriptionCancelled(payload);
      return res.status(200).json({ success: true, event: "subscription_cancelled" });
    }

    // NEW SIGNUP vs EXISTING USER UPDATE
    if (payload.CurrentSubscription) {
      const existingUser = await User.findOne({
        $or: [{ outsetaAccountUid: accountUid }, { email }]
      });

      if (!existingUser) {
        webhookLogger.info("New user → routing to handleOutsetaSubscriptionCreated", { accountUid, email });
        await handleOutsetaSubscriptionCreated(payload);
        return res.status(200).json({ success: true, event: "subscription_created" });
      } else {
        webhookLogger.info("Existing user → routing to handleOutsetaSubscriptionCancelled", { accountUid, email });
        await handleOutsetaSubscriptionCancelled(payload);
        return res.status(200).json({ success: true, event: "subscription_updated" });
      }
    }

    // UNHANDLED
    webhookLogger.warn("Unhandled Outseta webhook", { accountUid, email, accountStage, stageLabel });
    return res.status(200).json({ success: true, event: "unhandled" });

  } catch (err) {
    webhookLogger.error("Outseta Webhook Failed", {
      error: err.message,
      stack: err.stack,
    });
    res.status(500).json({ error: "Webhook failed" });
  }
};

/* =========================================================
  START : OUTSETA EVENT HANDLERS
========================================================= */
async function handleOutsetaSubscriptionCreated(account) {
  console.log("Outseta subscription created for account:", account.Uid);

  const accountUid = account.Uid;
  const email = account.PrimaryContact?.Email;
  const referer = account.PrimaryContact?.Referer || "";
  console.log('accountUid',accountUid);
  console.log('email',email);
  console.log('referer',referer);

  const subscription = account.CurrentSubscription;
  if (!subscription) {
    console.log("No active subscription found");
    return;
  }
  
  // Referer URL se pendingRegistrationId extract karo
  let pendingRegId = null;
  try {
    const refererUrl = new URL(referer);
    pendingRegId = refererUrl.searchParams.get("Account.pendingRegistrationId");
    email = refererUrl.searchParams.get("email");
  } catch (e) {
    webhookLogger.warn("Referer parse failed", { referer });
  }
  console.log('pendingRegId',pendingRegId);
  webhookLogger.info("Extracted pendingRegId", { pendingRegId, email });

  // PRIMARY: ID se match
  let pendingReg = null;
  if (pendingRegId) {
    pendingReg = await PendingRegistration.findOneAndUpdate(
      { _id: pendingRegId, status: "pending_payment" },
      { $set: { status: "payment_processing" } },
      { new: false }
    );
  }

  // FALLBACK: Email se match
  if (!pendingReg) {
    webhookLogger.warn("ID match failed, trying email fallback", { pendingRegId, email });
    pendingReg = await PendingRegistration.findOneAndUpdate(
      { email, status: "pending_payment" },
      { $set: { status: "payment_processing" } },
      { new: false }
    );
  }

  if (!pendingReg) {
    webhookLogger.warn("No pending registration found", { pendingRegId, email });
    return;
  }

  // const accountUid = account.Uid;
  // const email = account.PrimaryContact?.Email;

  // // 🔎 Find pending registration by EMAIL (BEST MATCH)
  // const pendingReg = await PendingRegistration.findOne({ email });

  // if (!pendingReg) {
  //   console.log("No pending registration found");
  //   return;
  // }

  // if (pendingReg.status === "completed") {
  //   console.log("Registration already completed");
  //   return;
  // }

  // 🔎 Prevent duplicate user creation
  const existingUser = await User.findOne({ outsetaAccountUid: accountUid });
  if (existingUser) {
    console.log("User already exists");
    return;
  }

  // Create User
  const userData = {
    firstName: pendingReg.firstName,
    lastName: pendingReg.lastName,
    email: pendingReg.email,
    password: pendingReg.password,
    role: pendingReg.role,
    state: pendingReg.state,

    registrationStatus: "approved",
    outsetaAccountUid: accountUid,
    outsetaPersonUid: account.PrimaryContact.Uid,

    subscriptionStatus: "active",
    subscriptionPlan: subscription.Plan.Name,
    subscriptionEndDate: new Date(subscription.RenewalDate)
  };

  if (pendingReg.role === "scout") {
    userData.team = pendingReg.teamId;
    userData.jobTitle = pendingReg.jobTitle;
  }

  if (pendingReg.role === "coach") {
    userData.school = pendingReg.school;
    userData.division = pendingReg.division;
    userData.conference = pendingReg.conference;
  }

  const user = await User.create(userData);

  // Create Subscription record
  await Subscription.create({
    user: user._id,
    outsetaSubscriptionUid: subscription.Uid,
    outsetaAccountUid: accountUid,
    plan: subscription.Plan.Name,
    status: "active",
    currentPeriodStart: new Date(subscription.StartDate),
    currentPeriodEnd: new Date(subscription.RenewalDate),
    paymentProvider: "outseta"
  });

  // Finalize pending registration
  pendingReg.status = "completed";
  pendingReg.outsetaAccountUid = accountUid;
  await pendingReg.save();

  // SuperAdmin Notifications
  await createAdminNotification({
    title: "New User Registered",
    message: `${user.role.toUpperCase()} ${user.firstName} ${user.lastName} registered successfully.`,
    type: "USER_REGISTRATION",
    referenceId: user._id,
    createdBy: user._id
  });

  console.log("User + Subscription successfully created from Outseta");
}

async function handleOutsetaSubscriptionUpdated(account) {
  console.log("🔄 Outseta subscription updated for account:", account.Uid);

  const subscription = account.CurrentSubscription;
  if (!subscription) return;

  // Find subscription record by outseta subscription UID
  const existingSubscription = await Subscription.findOne({
    outsetaSubscriptionUid: subscription.Uid
  });

  if (!existingSubscription) {
    console.log("⚠️ No subscription record found for UID:", subscription.Uid);
    return;
  }

  // Update subscription record

  existingSubscription.plan = subscription.Plan.Name;
  existingSubscription.status = "active";
  existingSubscription.currentPeriodStart = new Date(subscription.StartDate);
  existingSubscription.currentPeriodEnd = new Date(subscription.RenewalDate);
  await existingSubscription.save();

  // Sync User subscription fields
  await User.findByIdAndUpdate(existingSubscription.user, {
    subscriptionStatus: "active",
    subscriptionPlan: subscription.Plan.Name,
    subscriptionEndDate: new Date(subscription.RenewalDate)
  });

  console.log("✅ Subscription updated successfully for:", account.PrimaryContact?.Email);
}


async function handleOutsetaSubscriptionCancelling(account) {
  console.log("⏳ Subscription cancelling for account:", account.Uid);

  const subscription = account.CurrentSubscription;
  const cancelReason = account.ActivityEventData?.CancelationReason || "Not provided";
  const cancelComment = account.ActivityEventData?.Comment || "";
  const cancelledAt = new Date()
  const existingSubscription = await Subscription.findOne({
    outsetaSubscriptionUid: subscription.Uid
  });

  if (!existingSubscription) {
    console.log("⚠️ No subscription record found for UID:", subscription.Uid);
    return;
  }

  // Mark as "cancelling" — user still has access until period end
  existingSubscription.status = "canceled";
  existingSubscription.cancelRequestedAt = new Date();
  existingSubscription.cancelReason = cancelReason;
  existingSubscription.cancelComment = cancelComment;
  existingSubscription.currentPeriodEnd = new Date(subscription.RenewalDate); // access ends here
  await existingSubscription.save();

  // Update user status to reflect pending cancellation
  await User.findByIdAndUpdate(existingSubscription.user, {
    subscriptionStatus: "canceled",
    subscriptionEndDate: new Date(subscription.RenewalDate),
    cancelledAt: cancelledAt
  });

  // Notify admins
  // const user = await User.findById(existingSubscription.user);
  // if (user) {
  //   await createAdminNotification({
  //     title: "Subscription Cancellation Requested",
  //     message: `${user.role.toUpperCase()} ${user.firstName} ${user.lastName} has requested cancellation. Reason: ${cancelReason}. Access ends: ${subscription.RenewalDate}`,
  //     type: "SUBSCRIPTION_CANCELLING",
  //     referenceId: user._id,
  //     createdBy: user._id
  //   });
  // }

  console.log(`✅ Subscription marked as cancelling. Reason: ${cancelReason}`);
}

async function handleOutsetaSubscriptionCancelled(account) {
  console.log("❌ Subscription fully cancelled for account:", account.Uid);

  // Find subscription by account UID since CurrentSubscription is null at this point
  const existingSubscription = await Subscription.findOne({
    outsetaAccountUid: account.Uid
  });

  if (!existingSubscription) {
    console.log("⚠️ No subscription record found for account:", account.Uid);
    return;
  }

  existingSubscription.status = "cancelled";
  existingSubscription.cancelledAt = new Date();
  await existingSubscription.save();

  // Revoke user access
  await User.findByIdAndUpdate(existingSubscription.user, {
    subscriptionStatus: "cancelled",
    registrationStatus: "suspended"
  });

  // Notify admins
  const user = await User.findById(existingSubscription.user);
  if (user) {
    await createAdminNotification({
      title: "Subscription Cancelled",
      message: `${user.role.toUpperCase()} ${user.firstName} ${user.lastName}'s subscription has been fully cancelled.`,
      type: "SUBSCRIPTION_CANCELLED",
      referenceId: user._id,
      createdBy: user._id
    });
  }

  console.log("✅ Subscription fully cancelled and user access revoked for:", account.Uid);
}

async function handleOutsetaPaymentSucceeded(account) {
  console.log("💰 Payment succeeded for account:", account.Uid);

  const invoice = account.StripeInvoices?.[0];
  const subscription = account.CurrentSubscription;
  if (!subscription) return;

  const existingSubscription = await Subscription.findOne({
    outsetaSubscriptionUid: subscription.Uid
  });

  if (!existingSubscription) return;

  // Extend access period on successful renewal
  existingSubscription.status = "active";
  existingSubscription.currentPeriodEnd = new Date(subscription.RenewalDate);
  existingSubscription.lastPaymentAt = new Date();
  existingSubscription.lastPaymentAmount = invoice?.AmountDue || subscription.Rate;
  await existingSubscription.save();

  await User.findByIdAndUpdate(existingSubscription.user, {
    subscriptionStatus: "active",
    subscriptionEndDate: new Date(subscription.RenewalDate)
  });

  console.log("✅ Payment recorded and subscription renewed for:", account.PrimaryContact?.Email);
}

// Payment failed
async function handleOutsetaPaymentFailed(account) {
  console.log("❌ Payment failed for account:", account.Uid);

  const subscription = account.CurrentSubscription || account.LatestSubscription;
  if (!subscription) return;

  const existingSubscription = await Subscription.findOne({
    outsetaSubscriptionUid: subscription.Uid
  });

  if (!existingSubscription) return;

  existingSubscription.status = "past_due";
  existingSubscription.paymentFailedAt = new Date();
  await existingSubscription.save();

  await User.findByIdAndUpdate(existingSubscription.user, {
    subscriptionStatus: "past_due"
  });

  // Notify admins of failed payment
  const user = await User.findById(existingSubscription.user);
  if (user) {
    await createAdminNotification({
      title: "Payment Failed",
      message: `Payment failed for ${user.role.toUpperCase()} ${user.firstName} ${user.lastName}. Account may need attention.`,
      type: "PAYMENT_FAILED",
      referenceId: user._id,
      createdBy: user._id
    });
  }

  console.log("✅ Payment failure recorded for:", account.PrimaryContact?.Email);
}
/* =========================================================
  END : OUTSETA EVENT HANDLERS
========================================================= */







/* =========================================================
  START : STRIPE WEBHOOK HANDLER || STRIPE NOT IN USE 
========================================================= */
export const handleStripeWebhook = async (req, res) => {
  const sig = req.headers['stripe-signature'];
  let event;

  try {
    event = stripe.webhooks.constructEvent(
      req.body,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    console.error("❌ Webhook signature verification failed:", err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  console.log(`✅ Webhook received: ${event.type}`);

  try {
    switch (event.type) {
      case "checkout.session.completed":
        await handleCheckoutCompletedWithRegistration(event.data.object);
        break;

      case "customer.subscription.created":
        await handleSubscriptionCreated(event.data.object);
        break;

      case "customer.subscription.updated":
        await handleStripeSubscriptionUpdated(event.data.object);
        break;

      case "customer.subscription.deleted":
        await handleStripeSubscriptionDeleted(event.data.object);
        break;

      case "invoice.payment_succeeded":
        await handleStripePaymentSucceeded(event.data.object);
        break;

      case "invoice.payment_failed":
        await handleStripePaymentFailed(event.data.object);
        break;

      default:
        console.log(`⚠️ Unhandled event type: ${event.type}`);
    }

    res.json({ received: true });
  } catch (error) {
    console.error("❌ Webhook handler error:", error);
    res.status(500).json({ error: "Webhook handler failed" });
  }
};

async function handleCheckoutCompletedWithRegistration(session) {
  const pendingRegistrationId = session.metadata?.pendingRegistrationId;
  const subscriptionId = session.subscription;

  console.log(`✅ Checkout completed. Pending Reg: ${pendingRegistrationId}`);

  if (!pendingRegistrationId) {
    // Normal subscription update (existing users)
    return await handleCheckoutCompleted(session);
  }

  let createdUser = null;
  let createdSubscription = null;

  try {
    // Get pending registration
    const pendingReg = await PendingRegistration.findById(pendingRegistrationId);

    if (!pendingReg) {
      console.error("❌ Pending registration not found");
      return;
    }

    if (pendingReg.status === "completed") {
      console.log("⚠️ Registration already completed");
      return;
    }

    // ============================================
    // FIX: Properly retrieve subscription with expand
    // ============================================
    const stripeSubscription = await stripe.subscriptions.retrieve(subscriptionId);

    console.log('Stripe Subscription:', stripeSubscription);
    console.log('Current Period End:', stripeSubscription.current_period_end);

    // ============================================
    // FIX: Validate and format dates
    // ============================================
    const currentPeriodEnd = stripeSubscription.current_period_end
      ? new Date(stripeSubscription.current_period_end * 1000)
      : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // Default: 30 days from now

    const currentPeriodStart = stripeSubscription.current_period_start
      ? new Date(stripeSubscription.current_period_start * 1000)
      : new Date();

    // Validate dates
    if (isNaN(currentPeriodEnd.getTime())) {
      console.error("❌ Invalid currentPeriodEnd date");
      throw new Error("Invalid subscription dates from Stripe");
    }

    // Create User
    const userData = {
      firstName: pendingReg.firstName,
      lastName: pendingReg.lastName,
      email: pendingReg.email,
      password: pendingReg.password, // Already hashed
      role: pendingReg.role,
      state: pendingReg.state,
      profileImage: pendingReg.profileImage,
      registrationStatus: "approved",
      stripeCustomerId: session.customer,
      subscriptionStatus: stripeSubscription.status,
      subscriptionPlan: pendingReg.plan,
      subscriptionEndDate: currentPeriodEnd // Fixed date
    };

    // Role-specific fields
    if (pendingReg.role === "scout") {
      userData.team = pendingReg.teamId;
      userData.jobTitle = pendingReg.jobTitle;
    } else if (pendingReg.role === "coach") {
      userData.school = pendingReg.school;
      userData.division = pendingReg.division;
      userData.conference = pendingReg.conference;
    }

    console.log('Creating user with data:', userData);

    createdUser = await User.create(userData);

    console.log('✅ User created:', createdUser._id);

    // Create Subscription
    createdSubscription = await Subscription.create({
      user: createdUser._id,
      stripeCustomerId: session.customer,
      stripeSubscriptionId: subscriptionId,
      stripePriceId: stripeSubscription.items.data[0].price.id,
      plan: pendingReg.plan,
      status: stripeSubscription.status,
      currentPeriodStart: currentPeriodStart, // Fixed date
      currentPeriodEnd: currentPeriodEnd, // Fixed date
      paymentProvider: "stripe",
      cancelAtPeriodEnd: false,
      trialStart: stripeSubscription.trial_start
        ? new Date(stripeSubscription.trial_start * 1000)
        : null,
      trialEnd: stripeSubscription.trial_end
        ? new Date(stripeSubscription.trial_end * 1000)
        : null
    });

    console.log('✅ Subscription created:', createdSubscription._id);

    // Update pending registration status
    pendingReg.status = "completed";
    await pendingReg.save();

    console.log(`✅ Registration completed successfully for user: ${createdUser._id}`);
    console.log(`✅ Email: ${createdUser.email}`);

  } catch (error) {
    console.error("❌ Error completing registration:", error);

    // Rollback on error
    if (createdSubscription) {
      try {
        await Subscription.findByIdAndDelete(createdSubscription._id);
        console.log('🔄 Rolled back subscription');
      } catch (e) {
        console.error("Failed to rollback subscription:", e);
      }
    }

    if (createdUser) {
      try {
        await User.findByIdAndDelete(createdUser._id);
        console.log('🔄 Rolled back user');
      } catch (e) {
        console.error("Failed to rollback user:", e);
      }
    }
  }
}

async function handleCheckoutCompleted(session) {
  const userId = session.metadata?.userId;
  const plan = session.metadata?.plan;
  const subscriptionId = session.subscription;

  console.log(`✅ Checkout completed for user: ${userId}, plan: ${plan}`);

  if (!userId || !subscriptionId) {
    console.error("❌ Missing userId or subscriptionId in checkout session");
    return;
  }

  try {
    // Get subscription details from Stripe
    const stripeSubscription = await stripe.subscriptions.retrieve(subscriptionId);

    // Create or update subscription in database
    const subscription = await Subscription.findOneAndUpdate(
      { stripeSubscriptionId: subscriptionId },
      {
        user: userId,
        stripeCustomerId: session.customer,
        stripeSubscriptionId: subscriptionId,
        stripePriceId: stripeSubscription.items.data[0].price.id,
        plan: plan,
        status: stripeSubscription.status,
        currentPeriodStart: new Date(stripeSubscription.current_period_start * 1000),
        currentPeriodEnd: new Date(stripeSubscription.current_period_end * 1000),
        cancelAtPeriodEnd: false,
        trialStart: stripeSubscription.trial_start
          ? new Date(stripeSubscription.trial_start * 1000)
          : null,
        trialEnd: stripeSubscription.trial_end
          ? new Date(stripeSubscription.trial_end * 1000)
          : null
      },
      { upsert: true, new: true }
    );

    // Update user document
    await User.findByIdAndUpdate(userId, {
      stripeCustomerId: session.customer,
      subscriptionStatus: stripeSubscription.status,
      subscriptionPlan: plan,
      subscriptionEndDate: new Date(stripeSubscription.current_period_end * 1000)
    });

    console.log(`✅ Subscription created/updated in database: ${subscription._id}`);
  } catch (error) {
    console.error("❌ Error in handleCheckoutCompleted:", error);
  }
}

async function handleSubscriptionCreated(data) {
  let createdUser = null;
  let createdSubscription = null;

  try {
    const {
      Account,
      Plan,
      Uid,
      SubscriptionStatus,
      CurrentPeriodStart,
      CurrentPeriodEnd
    } = data;

    console.log(`✅ Processing subscription created: ${Uid}`);

    // ============================================
    // FIND PENDING REGISTRATION BY OUTSETA ACCOUNT
    // ============================================
    const pendingReg = await PendingRegistration.findOne({
      outsetaAccountUid: Account.Uid
    });

    if (!pendingReg) {
      console.error("❌ Pending registration not found for account:", Account.Uid);

      // Try to find by email as fallback
      const accountDetails = await outseta.getPerson(Account.PrimaryContact.Uid);
      const pendingByEmail = await PendingRegistration.findOne({
        email: accountDetails.Email
      });

      if (!pendingByEmail) {
        console.error("❌ No pending registration found for this subscription");
        return;
      }

      // Update pending with Outseta IDs
      pendingByEmail.outsetaAccountUid = Account.Uid;
      pendingByEmail.outsetaPersonUid = Account.PrimaryContact.Uid;
      await pendingByEmail.save();

      return await completePendingRegistration(pendingByEmail, data);
    }

    // Check if already completed
    if (pendingReg.status === "completed") {
      console.log("⚠️ Registration already completed");
      return;
    }

    await completePendingRegistration(pendingReg, data);

  } catch (error) {
    console.error("❌ Error handling subscription created:", error);

    // Rollback on error
    if (createdSubscription) {
      try {
        await Subscription.findByIdAndDelete(createdSubscription._id);
        console.log('🔄 Rolled back subscription');
      } catch (e) {
        console.error("Failed to rollback subscription:", e);
      }
    }

    if (createdUser) {
      try {
        await User.findByIdAndDelete(createdUser._id);
        console.log('🔄 Rolled back user');
      } catch (e) {
        console.error("Failed to rollback user:", e);
      }
    }
  }
}

async function handleStripeSubscriptionUpdated(data) {
  try {
    const { Uid, SubscriptionStatus, CurrentPeriodEnd } = data;

    console.log(`🔄 Subscription updated: ${Uid}`);

    // Find subscription in YOUR database
    const subscription = await Subscription.findOne({
      outsetaSubscriptionUid: Uid
    });

    if (!subscription) {
      console.log("⚠️ Subscription not found in database");
      return;
    }

    // Update subscription
    subscription.status = SubscriptionStatus.toLowerCase();
    subscription.currentPeriodEnd = new Date(CurrentPeriodEnd);
    await subscription.save();

    // Update user
    await User.findByIdAndUpdate(subscription.user, {
      subscriptionStatus: SubscriptionStatus.toLowerCase(),
      subscriptionEndDate: new Date(CurrentPeriodEnd)
    });

    console.log(`✅ Subscription updated: ${Uid}`);

  } catch (error) {
    console.error("❌ Error handling subscription updated:", error);
  }
}

async function completePendingRegistration(pendingReg, subscriptionData) {
  const {
    Uid,
    SubscriptionStatus,
    CurrentPeriodStart,
    CurrentPeriodEnd,
    Plan
  } = subscriptionData;

  console.log(`✅ Completing registration for: ${pendingReg.email}`);

  let createdUser = null;
  let createdSubscription = null;

  try {
    // ============================================
    // CREATE USER
    // ============================================
    const userData = {
      firstName: pendingReg.firstName,
      lastName: pendingReg.lastName,
      email: pendingReg.email,
      password: pendingReg.password,
      role: pendingReg.role,
      state: pendingReg.state,
      profileImage: pendingReg.profileImage,
      registrationStatus: "approved",
      outsetaPersonUid: pendingReg.outsetaPersonUid,
      outsetaAccountUid: pendingReg.outsetaAccountUid,
      subscriptionStatus: SubscriptionStatus.toLowerCase(),
      subscriptionPlan: Plan.Name,
      subscriptionEndDate: new Date(CurrentPeriodEnd)
    };

    // Role-specific fields
    if (pendingReg.role === "scout") {
      userData.team = pendingReg.teamId;
      userData.jobTitle = pendingReg.jobTitle;
    } else if (pendingReg.role === "coach") {
      userData.school = pendingReg.school;
      userData.division = pendingReg.division;
      userData.conference = pendingReg.conference;
    }

    createdUser = await User.create(userData);
    console.log(`✅ User created: ${createdUser._id}`);

    // ============================================
    // CREATE SUBSCRIPTION
    // ============================================
    createdSubscription = await Subscription.create({
      user: createdUser._id,
      outsetaSubscriptionUid: Uid,
      outsetaAccountUid: pendingReg.outsetaAccountUid,
      plan: pendingReg.plan,
      status: SubscriptionStatus.toLowerCase(),
      currentPeriodStart: new Date(CurrentPeriodStart),
      currentPeriodEnd: new Date(CurrentPeriodEnd),
      paymentProvider: "outseta",
      cancelAtPeriodEnd: false
    });

    console.log(`✅ Subscription created: ${createdSubscription._id}`);

    // ============================================
    // UPDATE PENDING REGISTRATION
    // ============================================
    pendingReg.status = "completed";
    pendingReg.outsetaSubscriptionUid = Uid;
    await pendingReg.save();

    console.log(`✅ Registration completed for: ${createdUser.email}`);

    // Optional: Send welcome email
    // await sendWelcomeEmail(createdUser);

    return { user: createdUser, subscription: createdSubscription };

  } catch (error) {
    console.error("❌ Error completing registration:", error);

    // Rollback
    if (createdSubscription) {
      await Subscription.findByIdAndDelete(createdSubscription._id);
      console.log('🔄 Rolled back subscription');
    }

    if (createdUser) {
      await User.findByIdAndDelete(createdUser._id);
      console.log('🔄 Rolled back user');
    }

    throw error;
  }
}

async function handleStripeSubscriptionDeleted(subscription) {
  console.log(`🗑️ Subscription deleted: ${subscription.id}`);

  try {
    const dbSubscription = await Subscription.findOne({
      stripeSubscriptionId: subscription.id
    });

    if (!dbSubscription) {
      console.log("⚠️ Subscription not found in database");
      return;
    }

    // Mark as canceled
    dbSubscription.status = "canceled";
    dbSubscription.canceledAt = new Date();
    await dbSubscription.save();

    // Update user document
    await User.findByIdAndUpdate(dbSubscription.user, {
      subscriptionStatus: "canceled",
      subscriptionPlan: "none"
    });

    console.log(`✅ Subscription marked as canceled in database`);
  } catch (error) {
    console.error("❌ Error in handleSubscriptionDeleted:", error);
  }
}

async function handleStripePaymentSucceeded(data) {
  console.log(`✅ Payment succeeded:`, data);
  // Optional: Send receipt email
}

async function handleStripePaymentFailed(data) {
  console.log(`❌ Payment failed:`, data);
  // Optional: Send notification to user
}
/* =========================================================
  END : STRIPE WEBHOOK HANDLER 
========================================================= */