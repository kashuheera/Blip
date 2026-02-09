# Pakistan — Major Restaurant Chains (HQ Contacts + Branch Locators)
Generated: 2026-02-09  
Purpose: Seed dataset for Blip onboarding & listings.  
Notes:
- This file is **starter + Codex-ready**. It includes **official contact channels** and **official branch locator pages** so Codex can scrape/expand to *all* branches.
- Branch emails are rarely public; when not available, use HQ/support email and/or store locator references.

---

## How Codex should expand this file (important)
For each chain:
1) Use the **Official Store Locator URL** below.
2) Extract for every branch:
   - Branch name (if available)
   - Full address
   - City
   - Phone (if provided)
   - Email (usually not provided → leave blank or use HQ email)
3) Output format per chain:
```md
### Branches
| City | Branch | Address | Phone | Email |
|---|---|---|---|---|
| Lahore | DHA Phase II | 242-U Commercial, Phase II, DHA Lahore | 111-xxx-xxx | support@... |
```

---

# 1) KFC Pakistan
**Official Contact / Complaints Email:** customercare@kfcpakistan.com  
**Official Store Locator:** https://www.kfcpakistan.com/store-locations  

### Example branches (from locator)
| City | Branch | Address | Phone | Email |
|---|---|---|---|---|
| Lahore | DHA Phase II | 242-U Commercial, Phase II, DHA Lahore | (use site) | customercare@kfcpakistan.com |
| Lahore | Gulberg | (see locator) | (use site) | customercare@kfcpakistan.com |

---

# 2) McDonald’s Pakistan
**Official Store Locator:** https://www.mcdonalds.com.pk/locate-us/  
**Official Contact Page:** https://www.mcdonalds.com.pk/contact-us/  

### Branches
> Codex: scrape locator and fill table.

| City | Branch | Address | Phone | Email |
|---|---|---|---|---|
|  |  |  |  |  |

---

# 3) Pizza Hut Pakistan
**Official Contact Email:** hutconnect@rustamfoodspk.com  
**Official Phone:** 111 000 765  
**Official Store Locations:** https://www.pizzahutpakistan.com/en/store-locations  

### Example branches (from locator)
| City | Branch | Address | Phone | Email |
|---|---|---|---|---|
| Lahore | Iqbal Town | 194 Asif Block, Allama Iqbal Town, Lahore | 111 000 765 | hutconnect@rustamfoodspk.com |
| Lahore | Gajjumatta | 22KM Gajjumata Stop Main Ferozpur Road | 111 000 765 | hutconnect@rustamfoodspk.com |
| Lahore | Emporium Mall | Emporium Mall, Shop 29, Food Court (see locator) | 111 000 765 | hutconnect@rustamfoodspk.com |

---

# 4) Domino’s Pakistan
**Official Store Finder:** https://www.dominos.com.pk/locations  
**Official Ordering Phone (Karachi):** 021-111-366-466  
**Public Ordering Email (brand posts):** order@dominos.com.pk  

### Branches
> Codex: scrape `/locations` and fill table.

| City | Branch | Address | Phone | Email |
|---|---|---|---|---|
|  |  |  |  |  |

---

# 5) Cheezious
**Support Email:** support@cheezious.com  
**Support Phone (from official app listing):** +92 51 111 446 699  
**Official Branch Locator:** https://cheezious.com/branches  

### Branches
> Codex: scrape `/branches` and fill table.

| City | Branch | Address | Phone | Email |
|---|---|---|---|---|
|  |  |  |  |  |

---

# 6) Hardee’s Pakistan
**UAN / Delivery Phone:** +92 42 111 200 400  
**Customer Email (public page):** careconnect@mdsfoods.pk  
**Online ordering site:** https://www.hardees.com.pk/  

### Branches
> Hardee’s Pakistan does not clearly expose a single official branch locator on the main site.
Codex approach:
- First check for a locations page on hardees.com.pk (crawl site for “location”, “store”, “branch”).
- If none, fall back to:
  - Official app / ordering flows (if they list stores),
  - Or Google Places API for “Hardee’s” in Pakistan (requires API key).

| City | Branch | Address | Phone | Email |
|---|---|---|---|---|
|  |  |  |  |  |

---

# 7) OPTP (One Potato Two Potato)
**Official Website:** https://www.optp.pk/  
**Official Mobile App (find nearest outlet):** https://play.google.com/store/apps/details?hl=en&id=optp.simplexyumapp  
**UAN (public page):** 111-11-OPTP (6787)

### Branches
> OPTP typically lists outlets inside the app or via “nearby outlets” UX.
Codex approach:
- Check optp.pk for an outlets/locations page (crawl site).
- If not available, use:
  - App endpoints (reverse is optional; careful),
  - Or Google Places API.

| City | Branch | Address | Phone | Email |
|---|---|---|---|---|
|  |  |  |  |  |

---

# 8) Subway (Pakistan)
Subway store locations vary by franchisee; the official franchise contact page lists regional contacts.

**Official Franchise Contacts (Pakistan):** https://www.subway.com/en-PK/OwnAFranchise/ContactFranchiseSales  

### Contacts
| Region | Contact | Phone | Email |
|---|---|---|---|
| Karachi / Sindh / Baluchistan | Tariq Salim | +1 300 8264500 | tariqsalimkarim@gmail.com |
| Islamabad / KP / RATA | Osman Maqbool | +1 300 8221697 | osman.maqbool@maqcorp.com.pk |

### Branches
> Codex: Subway’s official Pakistan site may not provide a full branch list. Use:
- Google Places API query “Subway” + Pakistan, then cluster by city.

| City | Branch | Address | Phone | Email |
|---|---|---|---|---|
|  |  |  |  |  |

---

## Next chains to add (Phase 2)
- OPTP-style local chains: Johnny & Jugnu, Burger Lab, Howdy, Daily Deli, etc.
- City-first premium restaurants (Karachi/Lahore/Islamabad)
