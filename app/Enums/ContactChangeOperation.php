<?php

namespace App\Enums;

enum ContactChangeOperation: string
{
    case Update = 'update';
    case Delete = 'delete';
}
