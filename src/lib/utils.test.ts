import { describe, it, expect } from 'vitest';
import { actionTookEffect } from './utils';

interface Item {
  id: string;
  status: 'active' | 'suspended';
}

describe('actionTookEffect', () => {
  // Los endpoints de suspender/reactivar responden success:true aunque el
  // UPDATE afecte cero filas. Estas pruebas cubren los tres escenarios que
  // el panel tiene que distinguir a partir de un refetch real.

  it('found=true, changed=true cuando el registro refrescado tiene el valor esperado', () => {
    const freshList: Item[] = [{ id: '1', status: 'suspended' }];
    const result = actionTookEffect(freshList, '1', 'status', 'suspended');
    expect(result).toEqual({ found: true, changed: true });
  });

  it('found=true, changed=false cuando el UPDATE no tocó ninguna fila (bug del backend)', () => {
    const freshList: Item[] = [{ id: '1', status: 'active' }];
    const result = actionTookEffect(freshList, '1', 'status', 'suspended');
    expect(result).toEqual({ found: true, changed: false });
  });

  it('found=false cuando el id ya no aparece en la lista recargada', () => {
    const freshList: Item[] = [{ id: '2', status: 'active' }];
    const result = actionTookEffect(freshList, '1', 'status', 'suspended');
    expect(result).toEqual({ found: false, changed: false });
  });

  it('found=false con lista vacía', () => {
    const result = actionTookEffect([] as Item[], '1', 'status', 'suspended');
    expect(result).toEqual({ found: false, changed: false });
  });
});
