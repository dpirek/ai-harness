import BaseComponent from "../components/base-component.js";
import {
  evaluateMessageAgainstFilter
} from "../services/email-message.js";
import { listFilters } from "../services/filter-api.js";
import { getCachedEmailAnalysisMap } from "../services/email-cache.js";

class Header extends BaseComponent {
  users = [];
  navList = [
    { name: 'Inbox', path: '/', icon: 'bi-inbox', countKey: 'inbox' },
    { name: 'Sent', path: '/sent', icon: 'bi-send' },
    { name: 'Todo', path: '/todo', icon: 'bi-check2-square' },
    { name: 'Settings', path: '/settings', icon: 'bi-sliders' }
  ];
  filterNavList = [];
  loadedFilters = [];
  mobileMenuOpen = false;
  navCounts = {
    inbox: 0
  };
  
  constructor({ user } = null) {
    super();
    this.user = user;
  }

  logout() {
    fetch('/api/logout', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      }
    })
    .then(response => {
      if (response.ok) {
        this.innerHTML = '';
        this.navigateTo('/login');
      } else {
        console.error('Logout failed');
      }
    })
    .catch(error => console.error('Error during logout:', error));
  }

  connectedCallback() {
    if (this.user) {
      this.render();
      this.loadNavCounts();
      this.loadConfiguredFilters();
      this.boundFiltersUpdatedHandler = () => this.loadConfiguredFilters();
      window.addEventListener('filters-updated', this.boundFiltersUpdatedHandler);
    }    
  }

  disconnectedCallback() {
    if (this.boundFiltersUpdatedHandler) {
      window.removeEventListener('filters-updated', this.boundFiltersUpdatedHandler);
    }
  }

  async loadConfiguredFilters() {
    try {
      const filters = await listFilters();
      const normalized = (Array.isArray(filters) ? filters : [])
        .filter((item) => item?.enabled !== false)
        .map((item) => ({
          id: String(item?.id || ''),
          name: String(item?.name || 'Filter'),
          ruleType: String(item?.ruleType || 'contains'),
          field: String(item?.field || 'all'),
          value: String(item?.value || ''),
          enabled: item?.enabled !== false
        }))
        .filter((item) => item.id);
      this.loadedFilters = normalized;
      const next = normalized
        .map((item) => ({
          id: item.id,
          name: item.name,
          path: `/?filters=${encodeURIComponent(String(item?.id || ''))}`,
          icon: 'bi-funnel-fill',
          subItem: true,
          countKey: `filter:${item.id}`
        }));
      this.filterNavList = next;
      this.refresh();
      this.loadNavCounts();
    } catch (error) {
      // best-effort dynamic filter nav
    }
  }

  getConversationCount(messages = [], predicate = () => true) {
    const ids = new Set();
    (messages || []).forEach((message) => {
      if (!predicate(message)) return;
      const id = message?.threadId || message?.id;
      if (id) ids.add(id);
    });
    return ids.size;
  }

  async loadNavCounts() {
    try {
      const response = await fetch('/api/gmail/messages');
      if (!response.ok) return;
      const messages = await response.json();
      const list = Array.isArray(messages) ? messages : [];
      const messageIds = list.map((message) => message?.id).filter(Boolean);
      const byMessageId = messageIds.length ? await getCachedEmailAnalysisMap(messageIds).catch(() => ({})) : {};
      const enriched = list.map((message) => ({
        ...message,
        aiAnalysis: byMessageId?.[message?.id] || null
      }));
      const counts = { inbox: this.getConversationCount(list) };
      this.filterNavList.forEach((filterNavItem) => {
        const filterId = String(filterNavItem?.id || '');
        if (!filterId) return;
        const key = `filter:${filterId}`;
        const fullFilter = (this.loadedFilters || []).find((item) => String(item?.id || '') === filterId);
        counts[key] = this.getConversationCount(enriched, (message) => evaluateMessageAgainstFilter(message, fullFilter));
      });
      this.navCounts = counts;
      this.refresh();
    } catch (error) {
      // best-effort nav counts
    }
  }

  toggleMobileMenu() {
    this.mobileMenuOpen = !this.mobileMenuOpen;
    this.refresh();
  }

  getMainNav({ mobile = false } = {}) {
    const [inboxItem, ...restItems] = this.navList;
    const listItems = [
      ...(inboxItem ? [inboxItem] : []),
      ...(this.filterNavList || []),
      ...restItems
    ];
    return this.createElement('ul', { 
      class: mobile ? 'nav flex-column' : 'nav me-auto',
      children: listItems.map(item => 
      this.createElement('li', { class: 'nav-item', children: [
        this.createElement('a', { 
          href: item.path, 
          class: item.subItem
            ? 'nav-link link-body-emphasis px-2 top-nav-link app-nav-subitem'
            : 'nav-link link-body-emphasis px-2 top-nav-link',
          children: [
            this.createElement('i', { class: `bi ${item.icon}` }),
            this.createElement('span', { innerText: item.name }),
            item.countKey
              ? this.createElement('span', {
                class: 'badge text-bg-light border app-nav-count',
                innerText: String(this.navCounts?.[item.countKey] ?? 0)
              })
              : null
          ],
          addEventListener: { 
            name: 'click',
            handler: (e) => {
              if (mobile) {
                this.mobileMenuOpen = false;
                this.refresh();
              }
              this.navigateTo(item.path, e);
            }
          }
        })
      ]})
    )});
  }

  getSearchForm({ mobile = false, inline = false } = {}) {
    return this.createElement('form', {
      class: mobile
        ? (inline ? 'app-mobile-search-inline ms-2 mb-0 flex-grow-1' : 'w-100 mb-2')
        : 'col-12 col-md-auto mb-3 mb-md-0 me-md-3',
      addEventListener: {
        name: 'submit',
        handler: (e) => {
          e.preventDefault();
          const query = e.target.querySelector('input').value;
          if (mobile && !inline) {
            this.mobileMenuOpen = false;
            this.refresh();
          }
          this.navigateTo(`/search?q=${encodeURIComponent(query)}`, e);
        }
      },
      children: [
        this.createElement('input', { 
          type: 'search', 
          class: 'form-control', 
          placeholder: 'Search...', 
          ariaLabel: 'Search',
        })
      ]
    });
  }

  getUserNav({ mobile = false } = {}) {
    const username = String(this.user?.username || 'User');

    return this.createElement('ul', { 
      class: mobile ? 'nav flex-column border-top pt-2 mt-2' : 'nav d-none d-md-flex', // hide small screens 'd-none d-md-flex
      children: [
        this.createElement('li', {
          class: 'nav-item w-100',
          children: [
            this.createElement('div', {
              class: 'd-flex align-items-center justify-content-between gap-2 px-2 py-1 app-user-row',
              children: [
                this.createElement('span', {
                  class: 'app-user-label d-inline-flex align-items-center gap-2',
                  children: [
                    this.createElement('i', { class: 'bi bi-person-circle' }),
                    this.createElement('span', { innerText: username })
                  ]
                }),
                this.createElement('button', {
                  type: 'button',
                  class: 'btn btn-sm btn-outline-secondary',
                  title: 'Logout',
                  ariaLabel: 'Logout',
                  children: [this.createElement('i', { class: 'bi bi-box-arrow-right' })],
                  addEventListener: {
                    name: 'click',
                    handler: () => {
                      if (mobile) {
                        this.mobileMenuOpen = false;
                        this.refresh();
                      }
                      this.logout();
                    }
                  }
                })
              ]
            })
          ]
        })
      ]
    });
  }

  render() {
    const header = this.createElement('div', {
      children: [
        this.createElement('nav', { class: 'app-nav-shell bg-body-tertiary border-bottom', children: [
          this.createElement('div', { 
            class: 'container-fluid d-flex flex-wrap app-header-shell',
            children: [
              this.createElement('div', {
                class: 'd-flex d-md-none w-100 align-items-center justify-content-start',
                children: [
                  this.createElement('button', {
                    class: 'btn btn-outline-secondary app-header-menu-btn',
                    type: 'button',
                    ariaLabel: 'Toggle navigation menu',
                    ariaExpanded: this.mobileMenuOpen ? 'true' : 'false',
                    children: [this.createElement('i', { class: this.mobileMenuOpen ? 'bi bi-x-lg' : 'bi bi-list' })],
                    addEventListener: {
                      name: 'click',
                      handler: () => this.toggleMobileMenu()
                    }
                  }),
                  this.getSearchForm({ mobile: true, inline: true })
                ]
              }),
              this.createElement('div', {
                class: 'app-header-desktop d-none d-md-flex flex-wrap align-items-center w-100',
                children: [
                  this.getUserNav(),
                  this.getSearchForm(),
                  this.getMainNav()
                ]
              }),
              this.mobileMenuOpen
                ? this.createElement('div', {
                    class: 'app-mobile-menu d-md-none w-100 mt-2 pt-2 border-top',
                    children: [
                      this.getUserNav({ mobile: true }),
                      this.getMainNav({ mobile: true }),
                    ]
                  })
                : null
            ]
          })
        ]})
      ]
    });

    this.appendChild(header);
  }
}

customElements.define("app-header", Header);

export default Header;
