(function () {
  const API_BASE = (() => {
    const meta = document.querySelector('meta[name="api-base"]');
    if (meta && meta.content) return meta.content.replace(/\/+$/, "");
    if (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1") {
      return "http://localhost:4000";
    }
    return window.location.origin.replace(/\/+$/, "");
  })();

  const PAGE_PATH = "/wechat-recharge.html";
  const state = {
    sessionId: null,
    user: null,
    activeTab: "credits",
    packages: [],
    membershipPlans: [],
    selectedPackage: null,
    selectedMembershipPlan: null,
    lastOrderType: "recharge",
    paying: false,
  };

  const $ = (id) => document.getElementById(id);

  function isWeChatBrowser() {
    return /MicroMessenger/i.test(navigator.userAgent || "");
  }

  function getQuery() {
    return new URLSearchParams(window.location.search);
  }

  function cleanUrl(paramsToRemove) {
    const url = new URL(window.location.href);
    paramsToRemove.forEach((key) => url.searchParams.delete(key));
    window.history.replaceState({}, "", url.toString());
  }

  async function api(path, options) {
    const res = await fetch(`${API_BASE}${path}`, {
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        ...(options && options.headers ? options.headers : {}),
      },
      ...options,
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      const message =
        (data && (data.message || data.error)) ||
        `请求失败 (${res.status})`;
      throw new Error(typeof message === "string" ? message : "请求失败");
    }
    return data;
  }

  function showSection(name) {
    ["loading", "outside-wechat", "bind", "recharge", "success", "error"].forEach((section) => {
      const el = $(`section-${section}`);
      if (!el) return;
      el.classList.toggle("hidden", section !== name);
    });
  }

  function hideLoading() {
    $("section-loading").classList.add("hidden");
  }

  function setError(message) {
    hideLoading();
    $("error-message").textContent = message || "操作失败，请稍后重试";
    showSection("error");
  }

  function renderUserChip(user) {
    const name = user.name || user.phone || "微信用户";
    const phone = user.phone && /^1\d{10}$/.test(user.phone) ? user.phone : "已绑定微信账号";
    $("user-name").textContent = name;
    $("user-phone").textContent = phone;
  }

  function formatBillingCycle(cycle) {
    if (cycle === "yearly") return "按年订阅";
    if (cycle === "monthly") return "按月订阅";
    return "订阅套餐";
  }

  function formatPlanMeta(plan) {
    const parts = [];
    if (plan.monthlyQuotaCredits) {
      parts.push(`月额度 ${Number(plan.monthlyQuotaCredits).toLocaleString()} 积分`);
    }
    if (plan.signupBonusCredits) {
      parts.push(`开通赠送 ${Number(plan.signupBonusCredits).toLocaleString()} 积分`);
    }
    if (plan.dailyGiftCredits) {
      parts.push(`每日赠送 ${Number(plan.dailyGiftCredits).toLocaleString()} 积分`);
    }
    return parts.join(" · ") || "会员专属权益";
  }

  function setActiveTab(tab) {
    state.activeTab = tab;
    const isCredits = tab === "credits";
    $("tab-credits").classList.toggle("active", isCredits);
    $("tab-membership").classList.toggle("active", !isCredits);
    $("tab-credits").setAttribute("aria-selected", isCredits ? "true" : "false");
    $("tab-membership").setAttribute("aria-selected", !isCredits ? "true" : "false");
    $("panel-credits").classList.toggle("hidden", !isCredits);
    $("panel-membership").classList.toggle("hidden", isCredits);
    $("pay-btn").textContent = isCredits ? "立即支付" : "立即订阅";
  }

  function renderPackages() {
    const container = $("package-list");
    container.innerHTML = "";
    state.packages.forEach((pkg) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "package";
      if (state.selectedPackage && state.selectedPackage.price === pkg.price) {
        btn.classList.add("active");
      }
      btn.innerHTML = `
        <div class="package-price">¥${pkg.price}</div>
        <div class="package-credits">${pkg.credits.toLocaleString()} 积分</div>
      `;
      btn.addEventListener("click", () => {
        state.selectedPackage = pkg;
        renderPackages();
      });
      container.appendChild(btn);
    });
  }

  function renderMembershipPlans() {
    const container = $("membership-list");
    container.innerHTML = "";
    if (!state.membershipPlans.length) {
      container.innerHTML = '<p class="status" style="padding: 12px 0;">暂无可订阅套餐</p>';
      return;
    }

    state.membershipPlans.forEach((plan) => {
      const btn = document.createElement("button");
      btn.type = "button";
      const isRecommended = Boolean(plan.metadata && plan.metadata.isRecommended) || plan.sortOrder === 10;
      btn.className = `membership-card${isRecommended ? " recommended" : ""}`;
      if (state.selectedMembershipPlan && state.selectedMembershipPlan.code === plan.code) {
        btn.classList.add("active");
      }

      btn.innerHTML = `
        ${isRecommended ? '<span class="membership-badge">推荐</span>' : ""}
        <div class="membership-card-head">
          <div class="membership-card-name">${plan.name}</div>
          <div class="membership-card-price">¥${plan.price}</div>
        </div>
        <div class="membership-card-cycle">${formatBillingCycle(plan.billingCycle)}</div>
        <div class="membership-card-meta">${formatPlanMeta(plan)}</div>
      `;

      btn.addEventListener("click", () => {
        state.selectedMembershipPlan = plan;
        renderMembershipPlans();
      });
      container.appendChild(btn);
    });
  }

  async function loadPackages() {
    const data = await api("/api/payment/h5/packages");
    state.packages = Array.isArray(data.packages) ? data.packages : [];
    if (!state.selectedPackage && state.packages.length) {
      state.selectedPackage = state.packages[0];
    }
    renderPackages();
  }

  async function loadMembershipPlans() {
    const data = await api("/api/payment/membership-plans");
    state.membershipPlans = Array.isArray(data.plans)
      ? data.plans.slice().sort((a, b) => Number(a.sortOrder || 0) - Number(b.sortOrder || 0))
      : [];
    if (!state.selectedMembershipPlan && state.membershipPlans.length) {
      state.selectedMembershipPlan = state.membershipPlans[0];
    }
    renderMembershipPlans();
  }

  async function loadPurchaseOptions() {
    await Promise.all([loadPackages(), loadMembershipPlans()]);
  }

  async function fetchCurrentUser() {
    try {
      const data = await api("/api/auth/me");
      if (data && data.user) {
        state.user = data.user;
        return data.user;
      }
    } catch {
      // ignore
    }
    return null;
  }

  function redirectToWechatAuth() {
    const returnTo = encodeURIComponent(PAGE_PATH);
    window.location.href = `${API_BASE}/api/auth/wechat-official/h5/authorize?returnTo=${returnTo}`;
  }

  async function initAuthFlow() {
    const query = getQuery();
    const wxError = query.get("wx_error");
    if (wxError) {
      cleanUrl(["wx_error"]);
      setError(decodeURIComponent(wxError));
      return;
    }

    state.sessionId = query.get("sessionId");
    const step = query.get("step");
    if (step === "bind" && state.sessionId) {
      cleanUrl(["sessionId", "step", "authed"]);
      hideLoading();
      showSection("bind");
      return;
    }

    cleanUrl(["authed"]);
    const user = await fetchCurrentUser();
    if (user) {
      renderUserChip(user);
      await loadPurchaseOptions();
      hideLoading();
      showSection("recharge");
      return;
    }

    if (!isWeChatBrowser()) {
      hideLoading();
      showSection("outside-wechat");
      return;
    }

    redirectToWechatAuth();
  }

  async function sendSmsCode() {
    const phone = $("bind-phone").value.trim();
    if (!/^1\d{10}$/.test(phone)) {
      alert("请输入正确的手机号");
      return;
    }
    const btn = $("send-code-btn");
    btn.disabled = true;
    try {
      const data = await api("/api/auth/send-sms", {
        method: "POST",
        body: JSON.stringify({ phone }),
      });
      if (!data.ok) throw new Error(data.error || "验证码发送失败");
      if (data.debugCode) {
        $("bind-code").value = data.debugCode;
        alert(`开发模式验证码：${data.debugCode}`);
      } else {
        alert("验证码已发送");
      }
      let seconds = 60;
      const timer = window.setInterval(() => {
        seconds -= 1;
        btn.textContent = seconds > 0 ? `${seconds}s 后重发` : "获取验证码";
        if (seconds <= 0) {
          window.clearInterval(timer);
          btn.disabled = false;
        }
      }, 1000);
    } catch (error) {
      btn.disabled = false;
      alert(error.message || "验证码发送失败");
    }
  }

  async function bindPhone() {
    if (!state.sessionId) {
      redirectToWechatAuth();
      return;
    }
    const phone = $("bind-phone").value.trim();
    const code = $("bind-code").value.trim();
    if (!/^1\d{10}$/.test(phone)) {
      alert("请输入正确的手机号");
      return;
    }
    if (!code) {
      alert("请输入验证码");
      return;
    }
    $("bind-submit-btn").disabled = true;
    try {
      const data = await api(`/api/auth/wechat-official/sessions/${state.sessionId}/bind-phone`, {
        method: "POST",
        body: JSON.stringify({ phone, code }),
      });
      state.user = data.user;
      state.sessionId = null;
      renderUserChip(data.user);
      await loadPurchaseOptions();
      hideLoading();
      showSection("recharge");
    } catch (error) {
      alert(error.message || "绑定失败");
    } finally {
      $("bind-submit-btn").disabled = false;
    }
  }

  function invokeWechatPay(params) {
    return new Promise((resolve, reject) => {
      const onBridgeReady = () => {
        window.WeixinJSBridge.invoke(
          "getBrandWCPayRequest",
          {
            appId: params.appId,
            timeStamp: params.timeStamp,
            nonceStr: params.nonceStr,
            package: params.package,
            signType: params.signType || "RSA",
            paySign: params.paySign,
          },
          (res) => {
            const msg = res && res.err_msg ? res.err_msg : "";
            if (msg === "get_brand_wcpay_request:ok") {
              resolve(res);
              return;
            }
            reject(new Error(msg || "支付未完成"));
          },
        );
      };

      if (typeof window.WeixinJSBridge === "undefined") {
        document.addEventListener("WeixinJSBridgeReady", onBridgeReady, false);
      } else {
        onBridgeReady();
      }
    });
  }

  async function pollOrderStatus(orderNo) {
    for (let i = 0; i < 20; i += 1) {
      await new Promise((resolve) => window.setTimeout(resolve, 1500));
      const data = await api(`/api/payment/order/${encodeURIComponent(orderNo)}/status`);
      if (data.status === "paid") {
        return data;
      }
    }
    throw new Error("支付结果确认中，请稍后在账户中查看");
  }

  async function showSuccessQr() {
    hideLoading();
    const isMembership = state.lastOrderType === "membership";
    $("success-desc").textContent = isMembership
      ? "会员订阅已生效，请添加下方私域微信。"
      : "积分已充值到您的账号，请添加下方私域微信。";
    const data = await api("/api/settings/wechat-qrcodes");
    const qrUrl = data.wechatGroup || data.officialAccount;
    $("success-qr").src = qrUrl || "/assets/group-erweima.jpg";
    $("success-tip").textContent = qrUrl
      ? "长按识别二维码，添加专属顾问进入私域社群，获取充值福利与使用指导。"
      : "支付成功！如需加入私域社群，请联系天宫 TAI 客服。";
    showSection("success");
  }

  async function paySelected() {
    if (state.paying) return;
    if (!isWeChatBrowser()) {
      alert("请在微信内完成支付");
      return;
    }

    const isMembership = state.activeTab === "membership";
    if (isMembership) {
      if (!state.selectedMembershipPlan) {
        alert("请选择订阅套餐");
        return;
      }
    } else if (!state.selectedPackage) {
      alert("请选择充值档位");
      return;
    }

    state.paying = true;
    $("pay-btn").disabled = true;
    $("pay-btn").textContent = "正在发起支付...";

    try {
      const order = isMembership
        ? await api("/api/payment/h5/membership-order", {
            method: "POST",
            body: JSON.stringify({ planCode: state.selectedMembershipPlan.code }),
          })
        : await api("/api/payment/h5/order", {
            method: "POST",
            body: JSON.stringify({
              amount: state.selectedPackage.price,
              credits: state.selectedPackage.credits,
            }),
          });

      state.lastOrderType = isMembership ? "membership" : "recharge";

      if (!order.jsapiPayParams) {
        throw new Error("未获取到微信支付参数");
      }

      await invokeWechatPay(order.jsapiPayParams);
      await pollOrderStatus(order.orderNo);
      await showSuccessQr();
    } catch (error) {
      const message = error && error.message ? error.message : "支付失败";
      if (!message.includes("cancel")) {
        alert(message);
      }
    } finally {
      state.paying = false;
      $("pay-btn").disabled = false;
      $("pay-btn").textContent = isMembership ? "立即订阅" : "立即支付";
    }
  }

  function bindEvents() {
    $("send-code-btn").addEventListener("click", sendSmsCode);
    $("bind-submit-btn").addEventListener("click", bindPhone);
    $("pay-btn").addEventListener("click", paySelected);
    $("tab-credits").addEventListener("click", () => setActiveTab("credits"));
    $("tab-membership").addEventListener("click", () => setActiveTab("membership"));
    $("retry-btn").addEventListener("click", () => {
      if (isWeChatBrowser()) {
        redirectToWechatAuth();
      } else {
        showSection("outside-wechat");
      }
    });
    $("reload-btn").addEventListener("click", () => window.location.reload());
  }

  document.addEventListener("DOMContentLoaded", () => {
    bindEvents();
    setActiveTab("credits");
    initAuthFlow().catch((error) => {
      setError(error.message || "页面初始化失败");
    });
  });
})();
