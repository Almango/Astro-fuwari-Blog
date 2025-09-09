/**
 * 强力滚动保护脚本
 * 通过劫持滚动方法 + 拦截事件源头，彻底阻止 Twikoo 按钮点击导致的滚动跳转
 */

(() => {
	// 保存原始的滚动方法
	const originalScrollTo = window.scrollTo;
	const originalScrollBy = window.scrollBy;
	const originalScrollIntoView = Element.prototype.scrollIntoView;

	// 滚动保护状态
	const scrollProtection = {
		enabled: false,
		allowedY: null,
		startTime: 0,
		duration: 0,
		timeout: null,
	};

	// 检测是否为TOC导航触发的滚动
	function checkIsTOCNavigation() {
		const stack = new Error().stack;
		if (
			stack &&
			(stack.includes("handleAnchorClick") || stack.includes("TOC.astro"))
		)
			return true;
		if (
			window.tocClickTimestamp &&
			Date.now() - window.tocClickTimestamp < 1000
		)
			return true;
		const activeElement = document.activeElement;
		if (activeElement && activeElement.closest("#toc, .table-of-contents"))
			return true;
		return false;
	}

	// 启动滚动保护（新增：立即锁定当前滚动位置）
	function enableScrollProtection(duration = 3000, currentY = null) {
		// 立即记录当前滚动位置，避免延迟导致的位置偏差
		const currentScrollY =
			currentY !== null ? currentY : window.scrollY || window.pageYOffset;
		scrollProtection.enabled = true;
		scrollProtection.allowedY = currentScrollY;
		scrollProtection.startTime = Date.now();
		scrollProtection.duration = duration;

		if (scrollProtection.timeout) clearTimeout(scrollProtection.timeout);
		scrollProtection.timeout = setTimeout(() => {
			scrollProtection.enabled = false;
			console.log("[强力滚动保护] 保护期结束");
		}, duration);

		console.log(
			`[强力滚动保护] 启动保护 ${duration}ms，允许Y位置:`,
			scrollProtection.allowedY,
		);
	}

	// 检查滚动是否被允许（优化：严格限制非法滚动）
	function isScrollAllowed(x, y) {
		if (!scrollProtection.enabled) return true;
		const isTOCNavigation = checkIsTOCNavigation();
		if (isTOCNavigation) {
			console.log("[强力滚动保护] 检测到TOC导航，允许滚动");
			return true;
		}

		// 缩小容差范围（从50px改为20px），减少误判
		const tolerance = 20;
		const allowedY = scrollProtection.allowedY;

		// 1. 允许小幅度调整
		if (Math.abs(y - allowedY) <= tolerance) return true;
		// 2. 阻止“跳顶部”（y<100且当前在更下方）
		if (y < 100 && allowedY > 100) {
			console.log(
				"[强力滚动保护] 阻止滚动到顶部，目标Y:",
				y,
				"允许Y:",
				allowedY,
			);
			return false;
		}
		// 3. 阻止任何大幅度滚动（新增：彻底拦截非法滚动）
		console.log(
			"[强力滚动保护] 阻止大幅度非法滚动，目标Y:",
			y,
			"允许Y:",
			allowedY,
		);
		return false;
	}

	// 劫持 window.scrollTo（优化：彻底阻止非法滚动，不执行“先滚再回”）
	window.scrollTo = (x, y) => {
		if (typeof x === "object") {
			const options = x;
			x = options.left || 0;
			y = options.top || 0;
		}

		if (isScrollAllowed(x, y)) {
			originalScrollTo.call(window, x, y);
		} else {
			console.log("[强力滚动保护] 彻底阻止 scrollTo:", x, y);
			// 移除“滚回原位”的逻辑，避免视觉闪烁
			// originalScrollTo.call(window, x, scrollProtection.allowedY);
		}
	};

	// 劫持 window.scrollBy（同scrollTo优化）
	window.scrollBy = (x, y) => {
		const currentY = window.scrollY || window.pageYOffset;
		const targetY = currentY + y;

		if (typeof x === "object") {
			const options = x;
			x = options.left || 0;
			y = options.top || 0;
		}

		if (isScrollAllowed(x, targetY)) {
			originalScrollBy.call(window, x, y);
		} else {
			console.log("[强力滚动保护] 彻底阻止 scrollBy:", x, y);
		}
	};

	// 劫持 Element.scrollIntoView（优化：提前计算目标位置，彻底阻止）
	Element.prototype.scrollIntoView = function (options) {
		if (!scrollProtection.enabled) {
			originalScrollIntoView.call(this, options);
			return;
		}

		const rect = this.getBoundingClientRect();
		const currentY = window.scrollY || window.pageYOffset;
		const targetY = currentY + rect.top;

		if (isScrollAllowed(0, targetY)) {
			originalScrollIntoView.call(this, options);
		} else {
			console.log("[强力滚动保护] 彻底阻止 scrollIntoView");
		}
	};

	// 新增：拦截 Twikoo 按钮的点击事件源头（核心修复！）
	function interceptTwikooEvent(event) {
		const target = event.target;
		// 匹配 Twikoo 交互按钮（点赞、回复、提交等，根据实际class调整）
		const twikooActionBtn = target.closest(
			".tk-like, .tk-reply, .tk-submit, .tk-cancel, .tk-edit, .tk-delete, .tk-expand, .tk-owo",
		);

		if (twikooActionBtn) {
			// 1. 阻止可能触发滚动的默认行为（如a标签跳转、表单默认提交）
			if (event.preventDefault) event.preventDefault();
			// 2. 阻止事件冒泡（避免父元素触发滚动逻辑）
			if (event.stopPropagation) event.stopPropagation();
			// 3. 立即启动滚动保护（确保保护时机早于滚动触发）
			enableScrollProtection(4000);
			console.log("[强力滚动保护] 拦截 Twikoo 按钮点击，提前启动保护");
		}
	}

	// 监听点击事件（捕获阶段，优先拦截事件源头）
	document.addEventListener(
		"click",
		(event) => {
			// 先拦截 Twikoo 按钮事件源头
			interceptTwikooEvent(event);

			const target = event.target;

			// 原有TOC导航逻辑保留
			if (
				target.closest("#toc, .table-of-contents") &&
				target.closest('a[href^="#"]')
			) {
				window.tocClickTimestamp = Date.now();
				console.log("[强力滚动保护] 检测到TOC导航点击");
				return;
			}

			// 原有 Twikoo 交互检测逻辑保留（补充拦截）
			if (
				target.closest("#tcomment") ||
				target.matches(
					".tk-action-icon, .tk-submit, .tk-cancel, .tk-preview, .tk-owo, .tk-admin, .tk-edit, .tk-delete, .tk-reply, .tk-expand",
				) ||
				target.closest(
					".tk-action-icon, .tk-submit, .tk-cancel, .tk-preview, .tk-owo, .tk-admin, .tk-edit, .tk-delete, .tk-reply, .tk-expand",
				)
			) {
				enableScrollProtection(4000);
				console.log("[强力滚动保护] 检测到 Twikoo 交互，启动保护");
			}

			// 原有管理面板逻辑保留
			if (
				target.matches(
					".tk-admin-panel, .tk-admin-overlay, .tk-modal, .tk-dialog, .tk-admin-close, .tk-close",
				) ||
				target.closest(
					".tk-admin-panel, .tk-admin-overlay, .tk-modal, .tk-dialog, .tk-admin-close, .tk-close",
				) ||
				target.classList.contains("tk-admin") ||
				target.closest(".tk-admin")
			) {
				enableScrollProtection(6000);
				console.log("[强力滚动保护] 检测到 Twikoo 管理面板操作，启动长期保护");
			}

			// 原有遮罩层逻辑保留
			if (
				target.classList.contains("tk-overlay") ||
				target.classList.contains("tk-mask") ||
				target.matches('[class*="overlay"]') ||
				target.matches('[class*="mask"]') ||
				target.matches('[class*="backdrop"]')
			) {
				const tcommentEl = document.querySelector("#tcomment");
				if (
					tcommentEl &&
					(target.closest("#tcomment") || tcommentEl.contains(target))
				) {
					enableScrollProtection(4000);
					console.log("[强力滚动保护] 检测到 Twikoo 遮罩层点击，启动保护");
				}
			}
		},
		true, // 捕获阶段：优先于事件冒泡执行，确保拦截时机最早
	);

	// 监听表单提交（保留原有逻辑，补充源头拦截）
	document.addEventListener(
		"submit",
		(event) => {
			if (event.target.closest("#tcomment")) {
				// 阻止表单默认提交（避免提交后页面刷新/滚动）
				event.preventDefault();
				enableScrollProtection(4000);
				console.log("[强力滚动保护] 检测到 Twikoo 表单提交，启动保护");
				// 若需要手动触发表单提交，可在此处添加：event.target.submit();
			}
		},
		true,
	);

	// 原有键盘事件、DOM变化监听逻辑保留
	document.addEventListener(
		"keydown",
		(event) => {
			if (event.key === "Escape" || event.keyCode === 27) {
				const tcommentEl = document.querySelector("#tcomment");
				if (tcommentEl) {
					const adminPanel = tcommentEl.querySelector(
						".tk-admin-panel, .tk-modal, .tk-dialog, [class*='admin'], [class*='modal']",
					);
					if (adminPanel && adminPanel.offsetParent !== null) {
						enableScrollProtection(3000);
						console.log(
							"[强力滚动保护] 检测到 ESC 键关闭 Twikoo 管理面板，启动保护",
						);
					}
				}
			}
		},
		true,
	);

	const observer = new MutationObserver((mutations) => {
		mutations.forEach((mutation) => {
			if (mutation.type === "childList" || mutation.type === "attributes") {
				const target = mutation.target;
				if (target.closest && target.closest("#tcomment")) {
					if (
						mutation.removedNodes.length > 0 ||
						(mutation.type === "attributes" &&
							mutation.attributeName === "style")
					) {
						enableScrollProtection(2000);
						console.log("[强力滚动保护] 检测到 Twikoo DOM 变化，启动保护");
					}
				}
			}
		});
	});

	if (document.body) {
		observer.observe(document.body, {
			childList: true,
			subtree: true,
			attributes: true,
			attributeFilter: ["style", "class"],
		});
	} else {
		document.addEventListener("DOMContentLoaded", () => {
			observer.observe(document.body, {
				childList: true,
				subtree: true,
				attributes: true,
				attributeFilter: ["style", "class"],
			});
		});
	}

	// 全局接口保留
	window.scrollProtectionManager = {
		enable: enableScrollProtection,
		disable: () => {
			scrollProtection.enabled = false;
			if (scrollProtection.timeout) clearTimeout(scrollProtection.timeout);
			console.log("[强力滚动保护] 手动停止保护");
		},
		isEnabled: () => scrollProtection.enabled,
		getStatus: () => ({ ...scrollProtection }),
		forceProtect: (duration = 10000) => {
			enableScrollProtection(duration);
			console.log(`[强力滚动保护] 强制保护模式启动 ${duration}ms`);
		},
		getCurrentScroll: () => ({
			x: window.scrollX || window.pageXOffset,
			y: window.scrollY || window.pageYOffset,
		}),
		checkTwikooStatus: () => {
			const tcomment = document.querySelector("#tcomment");
			if (!tcomment) return { exists: false };
			const adminPanels = tcomment.querySelectorAll(
				".tk-admin-panel, .tk-modal, .tk-dialog, [class*='admin'], [class*='modal']",
			);
			const visiblePanels = Array.from(adminPanels).filter(
				(panel) => panel.offsetParent !== null,
			);
			return {
				exists: true,
				adminPanelsCount: adminPanels.length,
				visiblePanelsCount: visiblePanels.length,
				hasVisiblePanels: visiblePanels.length > 0,
			};
		},
	};

	console.log("[强力滚动保护] 初始化完成（已启用事件源头拦截）");
})();
