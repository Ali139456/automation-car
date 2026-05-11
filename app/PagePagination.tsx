import Link from "next/link";
import styles from "./page.module.css";

type Props = {
  page: number;
  totalPages: number;
  buildHref: (nextPage: number) => string;
  ariaLabel: string;
};

export function PagePagination({ page, totalPages, buildHref, ariaLabel }: Props) {
  if (totalPages <= 1) return null;

  return (
    <nav className={styles.pagination} aria-label={ariaLabel}>
      {page <= 1 ? (
        <span className={`${styles.paginationBtn} ${styles.paginationBtnDisabled}`}>
          Previous
        </span>
      ) : (
        <Link href={buildHref(page - 1)} className={styles.paginationBtn} prefetch={false}>
          Previous
        </Link>
      )}
      <span className={styles.paginationStatus}>
        Page {page} of {totalPages}
      </span>
      {page >= totalPages ? (
        <span className={`${styles.paginationBtn} ${styles.paginationBtnDisabled}`}>Next</span>
      ) : (
        <Link href={buildHref(page + 1)} className={styles.paginationBtn} prefetch={false}>
          Next
        </Link>
      )}
    </nav>
  );
}
