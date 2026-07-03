interface PaginationProps {
  currentPage: number
  totalItems: number
  pageSize: number
  onPageChange: (page: number) => void
  onPageSizeChange?: (size: number) => void
}

export default function Pagination({
  currentPage,
  totalItems,
  pageSize,
  onPageChange,
  onPageSizeChange,
}: PaginationProps) {
  const totalPages = Math.ceil(totalItems / pageSize) || 1

  // If there's 10 or fewer items total, no pagination is necessary
  if (totalItems <= 10) return null

  const pagesToShow: number[] = []
  const maxButtons = 5
  let startPage = Math.max(1, currentPage - Math.floor(maxButtons / 2))
  let endPage = Math.min(totalPages, startPage + maxButtons - 1)

  if (endPage - startPage + 1 < maxButtons) {
    startPage = Math.max(1, endPage - maxButtons + 1)
  }

  for (let i = startPage; i <= endPage; i++) {
    pagesToShow.push(i)
  }

  const startRecord = (currentPage - 1) * pageSize + 1
  const endRecord = Math.min(totalItems, currentPage * pageSize)

  return (
    <div className="mi-pagination">
      <div className="mi-pagination-info">
        عرض {startRecord.toLocaleString('en-US')} إلى {endRecord.toLocaleString('en-US')} من أصل {totalItems.toLocaleString('en-US')}
      </div>
      <div className="mi-pagination-controls">
        <button
          className="btn-pagination"
          disabled={currentPage === 1}
          onClick={() => onPageChange(1)}
          title="الصفحة الأولى"
        >
          «
        </button>
        <button
          className="btn-pagination"
          disabled={currentPage === 1}
          onClick={() => onPageChange(currentPage - 1)}
          title="الصفحة السابقة"
        >
          السابق
        </button>
        {startPage > 1 && <span className="mi-pagination-ellipsis">...</span>}
        {pagesToShow.map((page) => (
          <button
            key={page}
            className={`btn-pagination ${currentPage === page ? 'active' : ''}`}
            onClick={() => onPageChange(page)}
          >
            {page.toLocaleString('en-US')}
          </button>
        ))}
        {endPage < totalPages && <span className="mi-pagination-ellipsis">...</span>}
        <button
          className="btn-pagination"
          disabled={currentPage === totalPages}
          onClick={() => onPageChange(currentPage + 1)}
          title="الصفحة التالية"
        >
          التالي
        </button>
        <button
          className="btn-pagination"
          disabled={currentPage === totalPages}
          onClick={() => onPageChange(totalPages)}
          title="الصفحة الأخيرة"
        >
          »
        </button>
      </div>
      {onPageSizeChange && (
        <div className="mi-pagination-size">
          <span>الصفوف:</span>
          <select
            value={pageSize}
            onChange={(e) => onPageSizeChange(Number(e.target.value))}
          >
            {[10, 20, 25, 50, 100, 250].map((size) => (
              <option key={size} value={size}>
                {size.toLocaleString('en-US')}
              </option>
            ))}
          </select>
        </div>
      )}
    </div>
  )
}
