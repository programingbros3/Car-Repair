import { initDB, getDB } from '../src/database'
import { addSupplierInvoice, updateSupplierInvoice, getSupplierInvoice, getSupplierInvoices } from '../src/db/suppliers'
import type { SupplierInvoiceInput } from '../src/db/types'
import fs from 'fs'
import path from 'path'

async function runTest() {
  const dbPath = path.resolve('./test-garage-e2e.db')
  process.env.GARAGE_DB_PATH = dbPath
  if (fs.existsSync(dbPath)) {
    fs.unlinkSync(dbPath)
  }

  // 1. Initialize DB
  console.log('Initializing test database...')
  initDB()
  const db = getDB()

  try {
    // 2. Create a test supplier invoice
    console.log('\n--- A. إنشاء الفاتورة ---')
    const initialInput: SupplierInvoiceInput = {
      supplier_name: 'مورد تجريبي 1',
      supplier_phone: '0599123456',
      purchase_date: '2026-09-07',
      notes: 'فاتورة تجريبية لاختبار المشكلة',
      items: [
        { item_name: 'فلتر زيت', quantity: 10, unit_price: 25, discount_type: null, discount_value: 0 },
        { item_name: 'بواجي', quantity: 4, unit_price: 30, discount_type: 'fixed', discount_value: 20 },
        { item_name: 'زيت محرك 5W-40', quantity: 5, unit_price: 120, discount_type: 'percentage', discount_value: 10 },
      ],
      payments: [
        { method: 'cash', amount: 200, notes: 'دفعة أولى نقدية' }
      ]
    }

    const invoiceId = addSupplierInvoice(initialInput)
    console.log(`Created invoice ID: ${invoiceId}`)

    // Verify DB insertion
    const createdInvoice = getSupplierInvoice(invoiceId)
    if (!createdInvoice) throw new Error('Invoice not found after creation')
    console.log(`Total amount: ${createdInvoice.total_amount}`)
    console.log(`Amount paid: ${createdInvoice.amount_paid}`)
    console.log(`Amount remaining: ${createdInvoice.amount_remaining}`)
    console.log(`Items count: ${createdInvoice.items.length}`)
    if (createdInvoice.items.length !== 3) throw new Error('Items were not inserted correctly')

    // 3. Simulate UI opening for edit
    console.log('\n--- B. فتح الفاتورة للتعديل ---')
    // This is the bug the user described: getAll returns without items, getOne returns with items.
    // The UI now uses getOne.
    const editRecord = getSupplierInvoice(invoiceId)
    if (!editRecord || editRecord.items.length === 0) {
      throw new Error('BUG REPRODUCED: items are empty when fetching for edit!')
    }
    console.log(`Items fetched for edit: ${editRecord.items.length} items.`)
    editRecord.items.forEach(item => {
      console.log(` - ${item.item_name}: Qty ${item.quantity}, Price ${item.unit_price}, Discount: ${item.discount_value}`)
    })

    // 4. Modify items (complex operation)
    console.log('\n--- C. تعديل البنود ---')
    
    // Modify an existing item (change qty)
    const modifiedItems = [...initialInput.items]
    modifiedItems[0].quantity = 15 // Was 10
    
    // Modify another item (change price & discount)
    modifiedItems[1].unit_price = 35 // Was 30
    modifiedItems[1].discount_type = null
    modifiedItems[1].discount_value = 0 // Remove discount
    
    // Delete an item (remove the 3rd item)
    modifiedItems.splice(2, 1)

    // Add a new item
    modifiedItems.push({
      item_name: 'بريكات أمامية',
      quantity: 2,
      unit_price: 150,
      discount_type: 'percentage',
      discount_value: 5
    })

    const updateInput: SupplierInvoiceInput = {
      ...initialInput,
      notes: 'تم التعديل',
      items: modifiedItems,
      payments: initialInput.payments // Payments are not updated via updateSupplierInvoice, but we pass them to satisfy TS
    }

    updateSupplierInvoice(invoiceId, updateInput)
    console.log('Invoice updated successfully.')

    // 5. Verify after update
    console.log('\n--- D. التحقق بعد الحفظ ---')
    const updatedInvoice = getSupplierInvoice(invoiceId)
    if (!updatedInvoice) throw new Error('Invoice not found after update')
    
    console.log(`Updated Total amount: ${updatedInvoice.total_amount}`)
    console.log(`Amount paid: ${updatedInvoice.amount_paid}`)
    console.log(`Amount remaining: ${updatedInvoice.amount_remaining}`)
    console.log(`Updated Items count: ${updatedInvoice.items.length}`)
    
    if (updatedInvoice.items.length !== 3) throw new Error(`Expected 3 items, got ${updatedInvoice.items.length}`)
    
    // Check specific changes
    const filterItem = updatedInvoice.items.find(i => i.item_name === 'فلتر زيت')
    if (filterItem?.quantity !== 15) throw new Error('Quantity modification failed')
    
    const sparkPlugItem = updatedInvoice.items.find(i => i.item_name === 'بواجي')
    if (sparkPlugItem?.unit_price !== 35 || sparkPlugItem?.discount_type !== null) throw new Error('Price/Discount modification failed')
    
    const removedItem = updatedInvoice.items.find(i => i.item_name === 'زيت محرك 5W-40')
    if (removedItem) throw new Error('Item deletion failed, it is still there')
    
    const newItem = updatedInvoice.items.find(i => i.item_name === 'بريكات أمامية')
    if (!newItem) throw new Error('Item addition failed, not found')

    console.log('All item modifications verified successfully!')
    
    // 6. Verification of payments integrity
    console.log('\n--- التحقق من الدفعات ---')
    // We paid 200 initially.
    // Initial total was: (10*25) + (4*30 - 20) + (5*120 * 0.9) = 250 + 100 + 540 = 890
    // After edit: (15*25) + (4*35) + (2*150 * 0.95) = 375 + 140 + 285 = 800
    // Paid is still 200. Remaining should be 600.
    console.log(`Expected Total: 800, Actual: ${updatedInvoice.total_amount}`)
    console.log(`Expected Paid: 200, Actual: ${updatedInvoice.amount_paid}`)
    console.log(`Expected Remaining: 600, Actual: ${updatedInvoice.amount_remaining}`)
    
    if (updatedInvoice.total_amount !== 800) throw new Error('Total calculation mismatch')
    if (updatedInvoice.amount_paid !== 200) throw new Error('Paid amount was altered incorrectly')
    if (updatedInvoice.amount_remaining !== 600) throw new Error('Remaining amount calculation mismatch')
    
    console.log('Payments integrity verified successfully!')
    
    console.log('\n✅ All tests passed E2E successfully.')
    
  } catch (err) {
    console.error('\n❌ TEST FAILED:')
    console.error(err)
  } finally {
    // Cleanup
    db.close()
    if (fs.existsSync(dbPath)) {
      fs.unlinkSync(dbPath)
    }
  }
}

runTest()
