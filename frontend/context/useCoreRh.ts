import { useContext } from 'react';
import { CoreRhContext, type CoreRhValue } from './coreRhState';

export function useCoreRh(): CoreRhValue {
  const context = useContext(CoreRhContext);
  if (!context) throw new Error('useCoreRh deve ser usado dentro de CoreRhProvider.');
  return context;
}
