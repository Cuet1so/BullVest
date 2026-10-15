export const money = new Intl.NumberFormat('es-ES', {
  style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2,
});
export const quantity = new Intl.NumberFormat('es-ES', { maximumFractionDigits: 8 });
export const percentage = new Intl.NumberFormat('es-ES', { maximumFractionDigits: 1 });
export const transactionDate = new Intl.DateTimeFormat('es-ES', {
  day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
});
