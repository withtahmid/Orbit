# Orbit — Product Specification

## 1. Overview

This application is a personal and collaborative financial management system designed for small groups (family, friends) operating within isolated environments called **Spaces**. The system combines a ledger-based transaction engine with budgeting (envelopes) and long-term planning (plans), built on a strict allocation model.

---

## 2. Core Concepts

### 2.1 Space
A **Space** is an isolated financial environment where users collaborate.

Each Space contains:
- Members (with roles)
- Accounts (shared + linked personal)
- Categories
- Envelopes
- Plans
- Transactions
- Allocations
- Events

Isolation Rules:
- All data is isolated per Space
- Users and Accounts can be into multiple spaces.

---

## 3. Users & Roles

### Roles:
- **Owner**: Full control (including deletion of Space)
- **Editor**: Can create/edit/delete transactions, accounts, allocations
- **Viewer**: Read-only access

### Additional Rules:
- Every transaction stores the **user who created it**
- Multiple users can operate within the same Space
- Last-write-wins for concurrent edits

---

## 4. Accounts

### 4.1 Account Types

#### Asset Accounts
- Cash
- Bank
- FD
- DPS
- Mobile Banking
- Given borrow

#### Liability Accounts
- Credit Cards
- Loans
- Borrowed money
- EMI

#### Locked Accounts
- DPS (Deposit Pension Scheme)
- FDR (Fixed Deposit)
- Can be broken with special transaction

---

### 4.2 Ownership

Accoutns belong to spaces
Spaces have google drive like permission (owner/viewer) and only with account permission user can see and make transactions 
---

### 4.3 Rules

- Money exists ONLY in accounts
- Account balance is derived from transactions

---

## 5. Transactions (Ledger System)

### 5.1 Core Model

- Income: NULL → Account
- Expense: Account → NULL
- Transfer: Account → Account

---

### 5.2 Transaction Properties

Each transaction includes:
- Source account
- Destination account
- Amount (decimal)
- Category (mandatory)
- User (who performed it)
- Date & time
- Optional location (text)
- Optional event reference

---

### 5.3 Rules

- Every transaction must have a category
- Transactions affect ONLY account balances

---

### 5.4 Special Case

Transfers between users:
- Allowed if both users belong to same Space
- Allowed if both account owned by same user

---

## 6. Expense Categories & Envelopes

### 6.1 Expense Categories

- Hierarchical 
- Defined per Space
- Mandatory for every transaction

---

### 6.2 Budget Envelopes

- Represent budgeting buckets
- Each category maps to exactly ONE envelope

---

## 7. Allocation System

### 7.1 Core Principle

- Money lives ONLY in accounts
- Allocation is a logical layer

---

### 7.2 Allocation Rules
- Allocation target:
  - Envelope OR Plan
- One allocation entry = one chunk of money
- Multiple allocations per target allowed

---

### 7.3 Allocation Behavior

- Allocation does NOT move money
- negative amount is deallocation


---


## 9. Plans (Long-Term Goals)

### Characteristics:
- Hold allocation only
- Cannot be spent directly

### Usage Flow:

To spend from a plan:
1. Move allocation from Plan → Envelope
2. Spend via special something

---

## 10. Allocation Transfer

Allows moving allocation:
- Plan ↔ Envelope


---

## 11. Events

- Optional grouping mechanism
- Can include:
  - Expenses
  - Income

Examples:
- Wedding
- Tour

---

## 12. Editing & Deletion

### Editing Transaction

- Updates account balances
- Update envelop and all are tied

---


## 13. Constraints & Validations

- No spending from locked accounts
- No direct spending from plans
- expense Transactions must have category
- Allocation to envelop is mandatory before spending

---

## 14. System Invariants

1. Money exists only in accounts
3. Account balance = sum of transactions to whre the account is Destination - where source
4. Allocation is independent of transactions
6. Category maps to exactly one envelope
7. Plans are allocation-only
- Advanced analytics

---

## 16. Summary

This system is a hybrid of:
- Ledger accounting system
- Envelope budgeting system
- Goal-based financial planning

It is designed for correctness, clarity, and scalability for long-term personal and collaborative finance management.

