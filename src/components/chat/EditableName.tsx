import { useState, useRef, useEffect } from 'react';
import { Check, X, Pencil } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

interface EditableNameProps {
  value: string;
  onSave: (newName: string) => Promise<boolean>;
  className?: string;
  inputClassName?: string;
  disabled?: boolean;
}

export function EditableName({ 
  value, 
  onSave, 
  className,
  inputClassName,
  disabled = false 
}: EditableNameProps) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(value);
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const isActionPendingRef = useRef(false);

  // Sync with external value changes
  useEffect(() => {
    if (!editing) {
      setName(value);
    }
  }, [value, editing]);

  // Focus input when editing starts
  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editing]);

  const handleSave = async () => {
    if (name.trim() === value || !name.trim()) {
      setEditing(false);
      setName(value);
      return;
    }

    setSaving(true);
    const success = await onSave(name.trim());
    setSaving(false);

    if (success) {
      setEditing(false);
    } else {
      setName(value);
    }
  };

  const handleCancel = () => {
    setName(value);
    setEditing(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleSave();
    } else if (e.key === 'Escape') {
      handleCancel();
    }
  };

  if (editing) {
    return (
      <div className="flex items-center gap-1">
        <Input
          ref={inputRef}
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={handleKeyDown}
          onBlur={() => {
            setTimeout(() => {
              if (!saving && !isActionPendingRef.current) {
                handleCancel();
              }
              isActionPendingRef.current = false;
            }, 200);
          }}
          className={cn("h-7 text-sm px-2", inputClassName)}
          disabled={saving}
        />
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 text-primary hover:text-primary"
          onMouseDown={() => { isActionPendingRef.current = true; }}
          onClick={handleSave}
          disabled={saving}
        >
          <Check className="w-4 h-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 text-muted-foreground hover:text-destructive"
          onMouseDown={() => { isActionPendingRef.current = true; }}
          onClick={handleCancel}
          disabled={saving}
        >
          <X className="w-4 h-4" />
        </Button>
      </div>
    );
  }

  return (
    <div 
      className={cn(
        "flex items-center gap-1 group cursor-pointer",
        disabled && "cursor-default",
        className
      )}
      onClick={() => !disabled && setEditing(true)}
      title="Clique para editar o nome"
    >
      <span>{value}</span>
      {!disabled && (
        <Pencil className="w-3 h-3 opacity-0 group-hover:opacity-60 transition-opacity text-muted-foreground" />
      )}
    </div>
  );
}
